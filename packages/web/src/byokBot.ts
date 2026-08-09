/**
 * Optional LLM move chooser — adapter only (P15).
 *
 * The model never invents a move: it picks an index from an exhaustive
 * `legalMoves` list. Failures fall back to the heuristic `chooseMove`, and the
 * caller can see how often that happened (silent fallback hid bugs in playtest).
 */

import type { GameState, GeometryPort, Move, PlayerId, RulesPort } from '@arrows/contracts';
import { endTurn } from '@arrows/contracts';
import type { ByokConfig } from './byokConfig';
import {
  BYOK_UPSTREAM_HEADER,
  chatCompletionsUrl,
  isByokReady,
  resolveByokProxyUrl,
} from './byokConfig';
import { chooseMove, playBotTurn, type BotTurn } from './opponent';

const MAX_MOVES_PER_TURN = 64;
const MAX_LISTED_ARROWS = 120;
const RULES_BLURB = `You are seat B in Arrows Conqueror, a turn-based territorial game on a directed arrow tiling.
Movement follows arrow grain. Stacks spend allowance speed(N)=1+floor(log2 N) per turn.
Steps may leave trail; closing back onto your territory claims enclosed ground.
Enemy contact on an occupied arrow is combat; cutting an enemy trail evaporates it until a garrison.
Reply with ONLY the integer index of your chosen legal move. No prose.`;

const sortIds = (ids: readonly string[]): string[] =>
  [...ids].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const truncateIds = (ids: readonly string[]): { ids: string[]; truncated: boolean } => {
  const sorted = sortIds(ids);
  if (sorted.length <= MAX_LISTED_ARROWS) return { ids: sorted, truncated: false };
  return { ids: sorted.slice(0, MAX_LISTED_ARROWS), truncated: true };
};

/** Compact, JSON-serializable view for the prompt — not a rules DTO. */
export const snapshotForPrompt = (state: GameState, me: PlayerId): unknown => {
  const groups = [...state.groups.entries()]
    .map(([arrow, g]) => ({
      arrow: String(arrow),
      owner: String(g.owner),
      heads: g.heads,
      spent: g.spent,
      ...(g.speedOverride !== undefined ? { speedOverride: g.speedOverride } : {}),
    }))
    .toSorted((a, b) => (a.arrow < b.arrow ? -1 : a.arrow > b.arrow ? 1 : 0));

  const trails: Record<string, { count: number; sample: string[]; truncated: boolean }> = {};
  for (const [player, set] of state.trails) {
    const listed = truncateIds([...set].map(String));
    trails[String(player)] = {
      count: set.size,
      sample: listed.ids,
      truncated: listed.truncated,
    };
  }

  const territoryCounts: Record<string, number> = {};
  for (const owner of state.territory.values()) {
    const key = String(owner);
    territoryCounts[key] = (territoryCounts[key] ?? 0) + 1;
  }

  return {
    me: String(me),
    activePlayer: String(state.activePlayer),
    winner: state.winner === undefined ? null : String(state.winner),
    dominationStreak: state.dominationStreak,
    dominationHolder:
      state.dominationHolder === undefined ? null : String(state.dominationHolder),
    dominationN: state.dominationN,
    groups,
    trails,
    territoryCounts,
    spawnerCount: state.spawners.size,
  };
};

export const formatLegalMoves = (moves: readonly Move[]): string =>
  moves
    .map((m, i) => {
      switch (m.kind) {
        case 'step':
          return `${String(i)}: step from=${String(m.from)} exit=${String(m.exit)} count=${String(m.count)}`;
        case 'skip':
          return `${String(i)}: skip from=${String(m.from)}`;
        case 'endTurn':
          return `${String(i)}: endTurn`;
      }
    })
    .join('\n');

export const buildUserPrompt = (state: GameState, me: PlayerId, moves: readonly Move[]): string =>
  [
    'STATE_JSON:',
    JSON.stringify(snapshotForPrompt(state, me)),
    '',
    'LEGAL_MOVES (pick one index; inventing a move is illegal):',
    formatLegalMoves(moves),
    '',
    'Reply with the index integer only.',
  ].join('\n');

/** First integer token that lands in `[0, length)`. */
export const parseMoveIndex = (text: string, length: number): number | undefined => {
  if (length <= 0) return undefined;
  const match = /(\d+)/.exec(text);
  if (match === null) return undefined;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 0 || n >= length) return undefined;
  return n;
};

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null };
  }[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** POST chat/completions via optional same-origin / player-owned CORS relay. */
export const postChatCompletions = (
  config: ByokConfig,
  body: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<Response> => {
  const upstream = chatCompletionsUrl(config.baseUrl);
  const proxy = resolveByokProxyUrl(config);
  const url = proxy.length > 0 ? proxy : upstream;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey.trim()}`,
  };
  if (proxy.length > 0) headers[BYOK_UPSTREAM_HEADER] = upstream;
  return fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
};

export type LlmFetchResult =
  | { readonly ok: true; readonly index: number }
  | { readonly ok: false; readonly reason: string };

export const fetchLlmMoveIndex = async (
  config: ByokConfig,
  prompt: string,
  moveCount: number,
  fetchImpl: FetchLike = fetch,
): Promise<LlmFetchResult> => {
  if (!isByokReady(config)) return { ok: false, reason: 'byok not ready' };
  if (moveCount === 0) return { ok: false, reason: 'no legal moves' };
  let response: Response;
  try {
    response = await postChatCompletions(
      config,
      {
        model: config.model.trim(),
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: RULES_BLURB },
          { role: 'user', content: prompt },
        ],
      },
      fetchImpl,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    const via = resolveByokProxyUrl(config);
    return {
      ok: false,
      reason:
        via.length === 0
          ? `fetch failed: ${msg} (OpenAI blocks browser CORS — use pnpm dev, or set a personal proxy URL)`
          : `fetch failed: ${msg}`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: `HTTP ${String(response.status)} from ${chatCompletionsUrl(config.baseUrl)}`,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'response was not JSON' };
  }
  const content = (body as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return { ok: false, reason: 'missing choices[0].message.content' };
  }
  const index = parseMoveIndex(content, moveCount);
  if (index === undefined) {
    return { ok: false, reason: `unusable model reply: ${JSON.stringify(content)}` };
  }
  return { ok: true, index };
};

/** Tiny probe so the lobby can verify base URL + key + model before a match. */
export type ByokProbeResult =
  | { readonly ok: true; readonly sample: string }
  | { readonly ok: false; readonly reason: string };

export const testByokConnection = async (
  config: ByokConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ByokProbeResult> => {
  if (!isByokReady(config)) {
    return { ok: false, reason: 'fill base URL, API key, and model first' };
  }
  let response: Response;
  try {
    response = await postChatCompletions(
      config,
      {
        model: config.model.trim(),
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: 'system', content: 'Reply with exactly the digit 0 and nothing else.' },
          { role: 'user', content: '0' },
        ],
      },
      fetchImpl,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    const via = resolveByokProxyUrl(config);
    return {
      ok: false,
      reason:
        via.length === 0
          ? `fetch failed: ${msg} (OpenAI blocks browser CORS — play via pnpm --filter @arrows/web dev, or set Proxy URL to a relay on your personal infra)`
          : `fetch failed: ${msg}`,
    };
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errBody: unknown = await response.json();
      if (typeof errBody === 'object' && errBody !== null) {
        detail = ` · ${JSON.stringify(errBody).slice(0, 240)}`;
      }
    } catch {
      // ignore body parse
    }
    return {
      ok: false,
      reason: `HTTP ${String(response.status)} from ${chatCompletionsUrl(config.baseUrl)}${detail}`,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'response was not JSON' };
  }
  const content = (body as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { ok: false, reason: 'missing choices[0].message.content' };
  }
  return { ok: true, sample: content.trim().slice(0, 40) };
};

export interface LlmChoice {
  readonly move: Move;
  readonly source: 'llm' | 'heuristic';
  readonly reason?: string;
}

export const chooseLlmMove = async (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  config: ByokConfig,
  fetchImpl: FetchLike = fetch,
): Promise<LlmChoice> => {
  const offered = rules.legalMoves(state);
  if (offered.length === 0) {
    return {
      move: chooseMove(geometry, rules, state, me),
      source: 'heuristic',
      reason: 'no legal moves listed',
    };
  }
  const prompt = buildUserPrompt(state, me, offered);
  const result = await fetchLlmMoveIndex(config, prompt, offered.length, fetchImpl);
  if (result.ok) {
    const picked = offered[result.index];
    if (picked !== undefined) return { move: picked, source: 'llm' };
  }
  const reason = result.ok ? 'index out of range' : result.reason;
  return {
    move: chooseMove(geometry, rules, state, me),
    source: 'heuristic',
    reason,
  };
};

export interface LlmBotTurn extends BotTurn {
  readonly llmHits: number;
  readonly llmFallbacks: number;
  readonly lastError: string | undefined;
}

export const playLlmBotTurn = async (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  config: ByokConfig,
  fetchImpl: FetchLike = fetch,
): Promise<LlmBotTurn> => {
  if (state.activePlayer !== me || state.winner !== undefined) {
    return { state, moves: [], llmHits: 0, llmFallbacks: 0, lastError: undefined };
  }
  if (!isByokReady(config)) {
    const fallback = playBotTurn(geometry, rules, state, me);
    return {
      ...fallback,
      llmHits: 0,
      llmFallbacks: fallback.moves.length,
      lastError: 'byok not ready',
    };
  }

  const moves: Move[] = [];
  let at = state;
  let llmHits = 0;
  let llmFallbacks = 0;
  let lastError: string | undefined;
  for (let i = 0; i < MAX_MOVES_PER_TURN; i += 1) {
    if (at.winner !== undefined || at.activePlayer !== me) break;
    const choice = await chooseLlmMove(geometry, rules, at, me, config, fetchImpl);
    if (choice.source === 'llm') llmHits += 1;
    else {
      llmFallbacks += 1;
      if (choice.reason !== undefined) lastError = choice.reason;
    }
    at = rules.apply(at, choice.move);
    moves.push(choice.move);
    if (choice.move.kind === 'endTurn') break;
  }
  if (at.winner === undefined && at.activePlayer === me) {
    const forced = endTurn();
    at = rules.apply(at, forced);
    moves.push(forced);
  }
  return { state: at, moves, llmHits, llmFallbacks, lastError };
};
