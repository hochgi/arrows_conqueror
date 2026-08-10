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
const MAX_LISTED_ARROWS = 24;
/** Keep the board summary small — huge spawner dumps make models restate state until max_tokens. */
const MAX_SPAWNER_ROWS = 12;

/**
 * Reasoning models (Nemotron Ultra, etc.) need thinking on to play well.
 * Output must still be machine-parseable via `{"move":N}` / `<<<MOVE:N>>>`.
 */
export const BYOK_THINKING_ON = {
  enable_thinking: true,
  force_nonempty_content: true,
} as const;

export const BYOK_THINKING_OFF = {
  enable_thinking: false,
  force_nonempty_content: true,
} as const;

/** Completion budget when the model is allowed to reason. */
export const BYOK_REASONING_MAX_TOKENS = 512;
/** Tiny budget when thinking is disabled. */
export const BYOK_FAST_MAX_TOKENS = 64;

/** Distinctive machine tag — accepted by the parser as a non-JSON fallback. */
export const MOVE_TAG = (n: number): string => `<<<MOVE:${String(n)}>>>`;

export const buildSystemPrompt = (me: PlayerId, reasoning: boolean): string => {
  const priorities = `Priorities: claim spawners early (inner/higher force first); cut exposed enemy trails; prefer small safe closes when exposed; merge toward powers of 2 (speed=1+floor(log2 N)); do not gift the strongest rival free shares.`;
  const contract = `Return ONLY a JSON object (no markdown fence):
{"move":N,"why":"short reason"}
N is a LEGAL_MOVES index. Do not invent moves. Do not reprint STATE_JSON.`;
  if (reasoning) {
    return `You are seat ${String(me)} in Arrows Conqueror (territorial conquest on directed arrows).
Choose the best LEGAL_MOVES index for this seat.
${priorities}

${contract}`;
  }
  return `You are seat ${String(me)} in Arrows Conqueror.
Choose the best LEGAL_MOVES index for this seat.
${priorities}

${contract}`;
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
  const interestingSpawners: {
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
    // Only surface contested / unclaimed / mine — not the whole radial field.
    const mine = (held[String(me)] ?? 0) > 0;
    const contested = Object.keys(held).length > 1 || (unclaimed > 0 && Object.keys(held).length > 0);
    if (!(mine || contested || unclaimed === 3)) continue;
    if (interestingSpawners.length < MAX_SPAWNER_ROWS) {
      interestingSpawners.push({
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
    spawnersShown: interestingSpawners.length,
    spawners: interestingSpawners,
  };
};

export const formatLegalMoves = (moves: readonly Move[]): string =>
  moves
    .map((m, i) => {
      switch (m.kind) {
        case 'step':
          return `[${String(i)}] step from=${String(m.from)} exit=${String(m.exit)} count=${String(m.count)}`;
        case 'skip':
          return `[${String(i)}] skip from=${String(m.from)}`;
        case 'endTurn':
          return `[${String(i)}] endTurn`;
      }
    })
    .join('\n');

export const buildUserPrompt = (
  geometry: GeometryPort,
  state: GameState,
  me: PlayerId,
  moves: readonly Move[],
  _reasoning: boolean,
): string =>
  [
    `Seat ${String(me)}. Pick one LEGAL_MOVES index.`,
    '',
    'STATE_JSON:',
    JSON.stringify(snapshotForPrompt(geometry, state, me)),
    '',
    'LEGAL_MOVES:',
    formatLegalMoves(moves),
    '',
    'Reply with only JSON: {"move":N,"why":"short"}',
  ].join('\n');

/**
 * Strict move-index parse — never harvest digits from arrow ids in prose.
 * Accepts: `{"move":N}`, `<<<MOVE:N>>>`, `ANSWER: N`, lone digit line/string.
 */
export const parseMoveIndex = (text: string, length: number): number | undefined => {
  if (length <= 0) return undefined;

  const accept = (raw: string): number | undefined => {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < length) return n;
    return undefined;
  };

  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return accept(trimmed);

  // Prefer explicit machine forms anywhere (last match wins — models often draft then fix).
  const tagged: number[] = [];
  for (const m of trimmed.matchAll(/\{\s*"move"\s*:\s*(\d+)\s*\}/g)) {
    const n = accept(m[1] ?? '');
    if (n !== undefined) tagged.push(n);
  }
  for (const m of trimmed.matchAll(/"move"\s*:\s*(\d+)/g)) {
    const n = accept(m[1] ?? '');
    if (n !== undefined) tagged.push(n);
  }
  for (const m of trimmed.matchAll(/<<<MOVE:(\d+)>>>/g)) {
    const n = accept(m[1] ?? '');
    if (n !== undefined) tagged.push(n);
  }
  if (tagged.length > 0) return tagged[tagged.length - 1];

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (/^\d+$/.test(line)) {
      const n = accept(line);
      if (n !== undefined) return n;
    }
    const legacy = /^(?:ANSWER|INDEX|MOVE|PICK)\s*[:=]\s*(\d+)\s*$/i.exec(line);
    if (legacy?.[1] !== undefined) {
      const n = accept(legacy[1]);
      if (n !== undefined) return n;
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
  // Structured picks need thinking *off*: forcing enable_thinking dumps CoT into
  // content and models burn the whole budget mid-essay (finish_reason=length).
  // Strategy stays in the system prompt; optional `why` carries a short rationale.
  const tokens =
    maxTokens ?? (config.reasoning ? BYOK_REASONING_MAX_TOKENS : BYOK_FAST_MAX_TOKENS);
  return {
    model: config.model.trim(),
    temperature: 0,
    max_tokens: tokens,
    messages,
    response_format: { type: 'json_object' },
    chat_template_kwargs: BYOK_THINKING_OFF,
    extra_body: { chat_template_kwargs: BYOK_THINKING_OFF },
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

  const runOnce = async (
    messages: readonly { readonly role: string; readonly content: string }[],
    maxTokens?: number,
    forceFast?: boolean,
  ): Promise<{ text: string } | { error: string }> => {
    const cfg = forceFast === true ? { ...config, reasoning: false } : config;
    let response: Response;
    try {
      response = await postChatCompletions(
        config,
        byokCompletionBody(cfg, messages, maxTokens),
        fetchImpl,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      const via = resolveByokProxyUrl(config);
      return {
        error:
          via.length === 0
            ? `fetch failed: ${msg} (OpenAI blocks browser CORS — use pnpm dev, or set a personal proxy URL)`
            : `fetch failed: ${msg}`,
      };
    }
    if (!response.ok) {
      return { error: `HTTP ${String(response.status)} from ${chatCompletionsUrl(config.baseUrl)}` };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { error: 'response was not JSON' };
    }
    const text = extractReplyText(body as ChatCompletionResponse);
    if (text.trim().length === 0) {
      return { error: 'missing choices[0].message.content' };
    }
    return { text };
  };

  const first = await runOnce([
    { role: 'system', content: buildSystemPrompt(me, config.reasoning) },
    { role: 'user', content: prompt },
  ]);
  if ('error' in first) return { ok: false, reason: first.error };

  let index = parseMoveIndex(first.text, moveCount);
  if (index !== undefined) return { ok: true, index };

  // Second shot: extract a move from the truncated essay (thinking dumped into content).
  const draft = first.text.slice(0, 1200);
  const extract = await runOnce(
    [
      {
        role: 'system',
        content: `Extract the LEGAL_MOVES index the draft was about to choose. Reply ONLY JSON: {"move":N}. Valid N is 0..${String(moveCount - 1)}.`,
      },
      {
        role: 'user',
        content: `Draft (may be truncated):\n${draft}\n\nLEGAL_MOVES count=${String(moveCount)}. Reply {"move":N} only.`,
      },
    ],
    64,
    true,
  );
  if ('error' in extract) {
    return {
      ok: false,
      reason: `unusable model reply: ${JSON.stringify(first.text.slice(0, 240))}`,
    };
  }
  index = parseMoveIndex(extract.text, moveCount);
  if (index === undefined) {
    return {
      ok: false,
      reason: `unusable model reply: ${JSON.stringify(first.text.slice(0, 240))}`,
    };
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
            content: 'Reply ONLY with JSON: {"move":0,"why":"probe"}',
          },
          { role: 'user', content: 'Return {"move":0,"why":"probe"}' },
        ],
        64,
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
