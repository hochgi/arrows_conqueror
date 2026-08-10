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
const MAX_SPAWNER_ROWS = 48;

/**
 * Reasoning models (Nemotron Ultra, etc.) need thinking on to play well.
 * We still require a parseable final `ANSWER: <n>` line — that is what failed
 * earlier when max_tokens was too small for the think dump.
 */
export const BYOK_THINKING_ON = {
  enable_thinking: true,
  force_nonempty_content: true,
} as const;

export const BYOK_THINKING_OFF = {
  enable_thinking: false,
  force_nonempty_content: true,
} as const;

/** Completion budget when the model is allowed to reason before ANSWER. */
export const BYOK_REASONING_MAX_TOKENS = 2048;
/** Tiny budget when thinking is disabled — bare index / ANSWER line only. */
export const BYOK_FAST_MAX_TOKENS = 32;

export const buildSystemPrompt = (me: PlayerId, reasoning: boolean): string => {
  const priorities = `Priorities: claim spawners early (inner/higher force first); cut exposed enemy trails before they close; prefer small safe closes when exposed, expand once garrisoned; merge toward powers of 2 (speed=1+floor(log2 N)); in multiplayer, do not gift the strongest rival free shares.`;
  if (reasoning) {
    return `You are seat ${String(me)} in Arrows Conqueror (territorial conquest on directed arrows).
Reason carefully about the best LEGAL_MOVES index for this seat.
${priorities}

When finished, end with exactly one final line and nothing after it:
ANSWER: <integer>
Example final line: ANSWER: 3`;
  }
  return `You are seat ${String(me)} in Arrows Conqueror (territorial game on directed arrows).
Pick the best LEGAL_MOVES index for this seat.
${priorities}

OUTPUT RULE: end with exactly one final line: ANSWER: <integer>
(or reply with only that integer). No arrow ids in the answer.`;
};

/**
 * Moves shown to the model. While any `step` exists, omit `skip` — otherwise
 * models burn the whole turn on skip spam.
 */
export const movesForLlm = (moves: readonly Move[]): readonly Move[] => {
  const hasStep = moves.some((m) => m.kind === 'step');
  if (!hasStep) return moves;
  return moves.filter((m) => m.kind !== 'skip');
};

const sortIds = (ids: readonly string[]): string[] =>
  [...ids].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const truncateIds = (ids: readonly string[]): { ids: string[]; truncated: boolean } => {
  const sorted = sortIds(ids);
  if (sorted.length <= MAX_LISTED_ARROWS) return { ids: sorted, truncated: false };
  return { ids: sorted.slice(0, MAX_LISTED_ARROWS), truncated: true };
};

const forceKey = (f: { readonly num: number; readonly den: number }): string =>
  `${String(f.num)}/${String(f.den)}`;

/** Compact, JSON-serializable view for the prompt — not a rules DTO. */
export const snapshotForPrompt = (
  geometry: GeometryPort,
  state: GameState,
  me: PlayerId,
): unknown => {
  const groups = [...state.groups.entries()]
    .map(([arrow, g]) => ({
      arrow: String(arrow),
      owner: String(g.owner),
      heads: g.heads,
      spent: g.spent,
      speed: 1 + Math.floor(Math.log2(Math.max(1, g.heads))),
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

  const shareCounts: Record<string, number> = {};
  for (const p of state.players) shareCounts[String(p)] = 0;
  const spawners: {
    vertex: string;
    force: string;
    held: Record<string, number>;
    unclaimed: number;
  }[] = [];
  const spawnerEntries = [...state.spawners.entries()].toSorted((a, b) =>
    String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0,
  );
  for (const [vertex, spawner] of spawnerEntries) {
    const borders = [...geometry.borderArrows(vertex)].toSorted((l, r) =>
      String(l) < String(r) ? -1 : 1,
    );
    const held: Record<string, number> = {};
    let unclaimed = 0;
    for (const arrow of borders) {
      const owner = state.territory.get(arrow);
      if (owner === undefined) {
        unclaimed += 1;
        continue;
      }
      const key = String(owner);
      held[key] = (held[key] ?? 0) + 1;
      shareCounts[key] = (shareCounts[key] ?? 0) + 1;
    }
    if (spawners.length < MAX_SPAWNER_ROWS) {
      spawners.push({
        vertex: String(vertex),
        force: forceKey(spawner.force),
        held,
        unclaimed,
      });
    }
  }

  return {
    me: String(me),
    players: state.players.map(String),
    activePlayer: String(state.activePlayer),
    winner: state.winner === undefined ? null : String(state.winner),
    dominationStreak: state.dominationStreak,
    dominationHolder:
      state.dominationHolder === undefined ? null : String(state.dominationHolder),
    dominationN: state.dominationN,
    groups,
    trails,
    territoryCounts,
    shareCounts,
    spawnerCount: state.spawners.size,
    spawnersTruncated: state.spawners.size > MAX_SPAWNER_ROWS,
    spawners,
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

export const buildUserPrompt = (
  geometry: GeometryPort,
  state: GameState,
  me: PlayerId,
  moves: readonly Move[],
  reasoning: boolean,
): string =>
  [
    `Seat ${String(me)}.`,
    reasoning
      ? 'Think through the position, then finish with ANSWER: <index>.'
      : 'Finish with ANSWER: <index> (or the bare integer).',
    '',
    'STATE_JSON:',
    JSON.stringify(snapshotForPrompt(geometry, state, me)),
    '',
    'LEGAL_MOVES:',
    formatLegalMoves(moves),
    '',
    'Final line must be: ANSWER: <integer>',
  ].join('\n');

/**
 * Strict index parse — never harvest digits from arrow ids in model prose.
 * Accepts: whole-string integer, a lone digit line, or `ANSWER:`/`INDEX:`/`MOVE:`.
 */
export const parseMoveIndex = (text: string, length: number): number | undefined => {
  if (length <= 0) return undefined;
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 0 && n < length) return n;
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (/^\d+$/.test(line)) {
      const n = Number(line);
      if (Number.isInteger(n) && n >= 0 && n < length) return n;
    }
    const tagged = /^(?:ANSWER|INDEX|MOVE)\s*[:=]\s*(\d+)\s*$/i.exec(line);
    if (tagged?.[1] !== undefined) {
      const n = Number(tagged[1]);
      if (Number.isInteger(n) && n >= 0 && n < length) return n;
    }
  }
  return undefined;
};

/** Request body fields shared by move picks and the lobby probe. */
export const byokCompletionBody = (
  config: ByokConfig,
  messages: readonly { readonly role: string; readonly content: string }[],
  maxTokens?: number,
): Record<string, unknown> => {
  const thinking = config.reasoning ? BYOK_THINKING_ON : BYOK_THINKING_OFF;
  const tokens =
    maxTokens ?? (config.reasoning ? BYOK_REASONING_MAX_TOKENS : BYOK_FAST_MAX_TOKENS);
  return {
    model: config.model.trim(),
    temperature: 0,
    max_tokens: tokens,
    messages,
    chat_template_kwargs: thinking,
    extra_body: { chat_template_kwargs: thinking },
  };
};

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
      readonly reasoning_content?: string | null;
    };
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

const extractReplyText = (body: ChatCompletionResponse): string => {
  const message = body.choices?.[0]?.message;
  if (message === undefined) return '';
  const content = typeof message.content === 'string' ? message.content : '';
  const reasoning =
    typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
  // Prefer content (usually the final ANSWER line); fall back to reasoning tail.
  if (content.trim().length > 0) return content;
  return reasoning;
};

export const fetchLlmMoveIndex = async (
  config: ByokConfig,
  prompt: string,
  moveCount: number,
  me: PlayerId,
  fetchImpl: FetchLike = fetch,
): Promise<LlmFetchResult> => {
  if (!isByokReady(config)) return { ok: false, reason: 'byok not ready' };
  if (moveCount === 0) return { ok: false, reason: 'no legal moves' };
  let response: Response;
  try {
    response = await postChatCompletions(
      config,
      byokCompletionBody(config, [
        { role: 'system', content: buildSystemPrompt(me, config.reasoning) },
        { role: 'user', content: prompt },
      ]),
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
  const text = extractReplyText(body as ChatCompletionResponse);
  if (text.trim().length === 0) {
    return { ok: false, reason: 'missing choices[0].message.content' };
  }
  const index = parseMoveIndex(text, moveCount);
  if (index === undefined) {
    return { ok: false, reason: `unusable model reply: ${JSON.stringify(text.slice(0, 240))}` };
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
      byokCompletionBody(
        config,
        [
          {
            role: 'system',
            content: config.reasoning
              ? 'Reply with exactly: ANSWER: 0'
              : 'Reply with exactly the digit 0 and nothing else.',
          },
          { role: 'user', content: '0' },
        ],
        config.reasoning ? 64 : 8,
      ),
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
  const offered = movesForLlm(rules.legalMoves(state));
  if (offered.length === 0) {
    return {
      move: chooseMove(geometry, rules, state, me),
      source: 'heuristic',
      reason: 'no legal moves listed',
    };
  }
  const prompt = buildUserPrompt(geometry, state, me, offered, config.reasoning);
  const result = await fetchLlmMoveIndex(config, prompt, offered.length, me, fetchImpl);
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
