/**
 * Adapter-side match record for playtest review.
 *
 * Same shape P10 expects: setup config + ordered moves. The core never sees this —
 * `makeMatch(config)` rebuilds the opening, `replay` folds the moves.
 */

import type { GameState, MatchConfig, Move, PlayerId } from '@conquarrow/contracts';
import type { SeatDriverSummary, SeatKind } from './seatPlan';

export const MATCH_LOG_VERSION = 1 as const;

export const LAST_MATCH_STORAGE_KEY = 'conquarrow:last-match';

/** Aggregate how chairs were driven — never includes API keys. */
export type BotMode = SeatDriverSummary;

export interface ByokRunStats {
  readonly llmHits: number;
  readonly llmFallbacks: number;
  /** Last fallback reason, if any (CORS / HTTP / parse). No secrets. */
  readonly lastError: string | undefined;
}

/** Per-seat driver metadata persisted in the match log (no secrets). */
export interface SeatDriverLog {
  readonly player: PlayerId;
  readonly kind: SeatKind;
  /** Model id when kind is byok — never the API key. */
  readonly model?: string;
}

/**
 * Lightweight playtest counters. Folded on each logged apply; never rules-core.
 * Closes = any player's territory grew. Cuts = any player's trail shrank.
 */
export interface MatchSummary {
  readonly steps: number;
  readonly endTurns: number;
  readonly skips: number;
  readonly closes: number;
  readonly cuts: number;
  /** Index into `moves` when territory first grew for anyone; undefined if never. */
  readonly firstCloseAt: number | undefined;
}

export const emptyMatchSummary = (): MatchSummary => ({
  steps: 0,
  endTurns: 0,
  skips: 0,
  closes: 0,
  cuts: 0,
  firstCloseAt: undefined,
});

const territoryOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const owner of state.territory.values()) if (owner === player) n += 1;
  return n;
};

const anyTerritoryGrew = (before: GameState, after: GameState): boolean => {
  for (const player of before.players) {
    if (territoryOf(after, player) > territoryOf(before, player)) return true;
  }
  // New players only present after? Unlikely mid-match; still scan after.players.
  for (const player of after.players) {
    if (territoryOf(after, player) > territoryOf(before, player)) return true;
  }
  return false;
};

const anyTrailShrunk = (before: GameState, after: GameState): boolean => {
  for (const [player, set] of before.trails) {
    const next = after.trails.get(player)?.size ?? 0;
    if (next < set.size) return true;
  }
  return false;
};

/** Pure fold of one applied batch into running counters. */
export const foldMatchSummary = (
  summary: MatchSummary,
  moves: readonly Move[],
  before: GameState,
  after: GameState,
  movesLoggedBefore: number,
): MatchSummary => {
  if (moves.length === 0) return summary;
  let steps = summary.steps;
  let endTurns = summary.endTurns;
  let skips = summary.skips;
  for (const m of moves) {
    if (m.kind === 'step') steps += 1;
    else if (m.kind === 'endTurn') endTurns += 1;
    else if (m.kind === 'skip') skips += 1;
  }
  const closed = anyTerritoryGrew(before, after);
  const cut = anyTrailShrunk(before, after);
  const closes = summary.closes + (closed ? 1 : 0);
  const cuts = summary.cuts + (cut ? 1 : 0);
  let firstCloseAt = summary.firstCloseAt;
  if (closed && firstCloseAt === undefined) {
    // Index of the first move in this batch within the full log.
    firstCloseAt = movesLoggedBefore;
  }
  return { steps, endTurns, skips, closes, cuts, firstCloseAt };
};

/** One-line HUD / review string. */
export const formatMatchSummary = (summary: MatchSummary): string => {
  const parts = [
    `${String(summary.steps)} steps`,
    `${String(summary.endTurns)} end-turns`,
    `${String(summary.closes)} closes`,
    `${String(summary.cuts)} cuts`,
  ];
  if (summary.skips > 0) parts.splice(2, 0, `${String(summary.skips)} skips`);
  if (summary.firstCloseAt !== undefined) {
    parts.push(`first close @ move ${String(summary.firstCloseAt)}`);
  }
  return parts.join(' · ');
};

export interface MatchLog {
  readonly version: typeof MATCH_LOG_VERSION;
  readonly config: MatchConfig;
  /** ISO timestamp from the adapter clock — review metadata only. */
  readonly startedAt: string;
  /** True when at least one seat is non-human. */
  readonly vsBot: boolean;
  readonly botMode: BotMode;
  readonly seats: readonly SeatDriverLog[];
  readonly byokStats: ByokRunStats | undefined;
  readonly byokStatsBySeat: Readonly<Record<string, ByokRunStats>> | undefined;
  /** First human seat, if any — else seat A. */
  readonly humanSeat: PlayerId;
  /** First AI seat, if any. */
  readonly botSeat: PlayerId | undefined;
  readonly moves: readonly Move[];
  readonly winner: PlayerId | undefined;
  /** Playtest counters; always present on new logs. */
  readonly summary: MatchSummary;
}

export const createMatchLog = (args: {
  readonly config: MatchConfig;
  readonly vsBot: boolean;
  readonly botMode: BotMode;
  readonly seats: readonly SeatDriverLog[];
  readonly humanSeat: PlayerId;
  readonly botSeat: PlayerId | undefined;
  readonly startedAt?: string;
}): MatchLog => {
  const anyByok = args.seats.some((s) => s.kind === 'byok');
  return {
    version: MATCH_LOG_VERSION,
    config: args.config,
    startedAt: args.startedAt ?? new Date().toISOString(),
    vsBot: args.vsBot,
    botMode: args.botMode,
    seats: args.seats,
    byokStats: anyByok ? { llmHits: 0, llmFallbacks: 0, lastError: undefined } : undefined,
    byokStatsBySeat: anyByok ? {} : undefined,
    humanSeat: args.humanSeat,
    botSeat: args.botSeat,
    moves: [],
    winner: undefined,
    summary: emptyMatchSummary(),
  };
};

export const appendMoves = (log: MatchLog, moves: readonly Move[]): MatchLog => {
  if (moves.length === 0) return log;
  return { ...log, moves: [...log.moves, ...moves] };
};

/** Append moves and fold summary from before→after. */
export const appendMovesWithSummary = (
  log: MatchLog,
  moves: readonly Move[],
  before: GameState,
  after: GameState,
): MatchLog => {
  if (moves.length === 0) return log;
  const summary = foldMatchSummary(
    log.summary ?? emptyMatchSummary(),
    moves,
    before,
    after,
    log.moves.length,
  );
  return { ...log, moves: [...log.moves, ...moves], summary };
};

export const withByokStats = (
  log: MatchLog,
  delta: ByokRunStats,
  seat?: PlayerId,
): MatchLog => {
  if (log.byokStats === undefined && log.byokStatsBySeat === undefined) return log;
  const prev = log.byokStats ?? { llmHits: 0, llmFallbacks: 0, lastError: undefined };
  const aggregate: ByokRunStats = {
    llmHits: prev.llmHits + delta.llmHits,
    llmFallbacks: prev.llmFallbacks + delta.llmFallbacks,
    lastError: delta.lastError ?? prev.lastError,
  };
  let bySeat = log.byokStatsBySeat;
  if (seat !== undefined) {
    const key = String(seat);
    const seatPrev = bySeat?.[key] ?? { llmHits: 0, llmFallbacks: 0, lastError: undefined };
    bySeat = {
      ...(bySeat ?? {}),
      [key]: {
        llmHits: seatPrev.llmHits + delta.llmHits,
        llmFallbacks: seatPrev.llmFallbacks + delta.llmFallbacks,
        lastError: delta.lastError ?? seatPrev.lastError,
      },
    };
  }
  return {
    ...log,
    byokStats: aggregate,
    ...(bySeat === undefined ? {} : { byokStatsBySeat: bySeat }),
  };
};

export const withWinner = (log: MatchLog, winner: PlayerId | undefined): MatchLog =>
  log.winner === winner ? log : { ...log, winner };

export const serializeMatchLog = (log: MatchLog): string => `${JSON.stringify(log, null, 2)}\n`;

/** Persist for post-game review. No-ops outside a browser. */
export const saveMatchLog = (log: MatchLog): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_MATCH_STORAGE_KEY, serializeMatchLog(log));
};

export const loadLastMatchLog = (): MatchLog | undefined => {
  if (typeof localStorage === 'undefined') return undefined;
  const raw = localStorage.getItem(LAST_MATCH_STORAGE_KEY);
  if (raw === null || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as MatchLog;
    if (parsed.summary === undefined) {
      return { ...parsed, summary: emptyMatchSummary() };
    }
    return parsed;
  } catch {
    return undefined;
  }
};

export const downloadMatchLog = (log: MatchLog, filename?: string): void => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeMatchLog(log)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `conquarrow-match-${log.startedAt.replaceAll(':', '').replaceAll('.', '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
