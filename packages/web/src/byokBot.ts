/**
 * Optional LLM move chooser — adapter only (P15).
 *
 * The model never invents a move: it picks an index from an exhaustive
 * `legalMoves` list. Failures fall back to the heuristic `chooseMove`.
 */

import type { GameState, GeometryPort, Move, PlayerId, RulesPort } from '@arrows/contracts';
import { endTurn } from '@arrows/contracts';
import type { ByokConfig } from './byokConfig';
import { chatCompletionsUrl, isByokReady } from './byokConfig';
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

export const fetchLlmMoveIndex = async (
  config: ByokConfig,
  prompt: string,
  moveCount: number,
  fetchImpl: FetchLike = fetch,
): Promise<number | undefined> => {
  if (!isByokReady(config) || moveCount === 0) return undefined;
  const url = chatCompletionsUrl(config.baseUrl);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: RULES_BLURB },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  const content = (body as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (typeof content !== 'string') return undefined;
  return parseMoveIndex(content, moveCount);
};

export const chooseLlmMove = async (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  config: ByokConfig,
  fetchImpl: FetchLike = fetch,
): Promise<Move> => {
  const offered = rules.legalMoves(state);
  if (offered.length === 0) {
    return chooseMove(geometry, rules, state, me);
  }
  const prompt = buildUserPrompt(state, me, offered);
  const index = await fetchLlmMoveIndex(config, prompt, offered.length, fetchImpl);
  if (index !== undefined) {
    const picked = offered[index];
    if (picked !== undefined) return picked;
  }
  return chooseMove(geometry, rules, state, me);
};

export const playLlmBotTurn = async (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  config: ByokConfig,
  fetchImpl: FetchLike = fetch,
): Promise<BotTurn> => {
  if (state.activePlayer !== me || state.winner !== undefined) {
    return { state, moves: [] };
  }
  if (!isByokReady(config)) {
    return playBotTurn(geometry, rules, state, me);
  }

  const moves: Move[] = [];
  let at = state;
  for (let i = 0; i < MAX_MOVES_PER_TURN; i += 1) {
    if (at.winner !== undefined || at.activePlayer !== me) break;
    const move = await chooseLlmMove(geometry, rules, at, me, config, fetchImpl);
    at = rules.apply(at, move);
    moves.push(move);
    if (move.kind === 'endTurn') break;
  }
  if (at.winner === undefined && at.activePlayer === me) {
    const forced = endTurn();
    at = rules.apply(at, forced);
    moves.push(forced);
  }
  return { state: at, moves };
};
