/**
 * Adapter-side match record for playtest review.
 *
 * Same shape P10 expects: setup config + ordered moves. The core never sees this —
 * `makeMatch(config)` rebuilds the opening, `replay` folds the moves.
 */

import type { MatchConfig, Move, PlayerId } from '@arrows/contracts';
import type { SeatDriverSummary, SeatKind } from './seatPlan';

export const MATCH_LOG_VERSION = 1 as const;

export const LAST_MATCH_STORAGE_KEY = 'arrows-conqueror:last-match';

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
  };
};

export const appendMoves = (log: MatchLog, moves: readonly Move[]): MatchLog => {
  if (moves.length === 0) return log;
  return { ...log, moves: [...log.moves, ...moves] };
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
    return JSON.parse(raw) as MatchLog;
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
    `arrows-match-${log.startedAt.replaceAll(':', '').replaceAll('.', '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
