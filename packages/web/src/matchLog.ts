/**
 * Adapter-side match record for playtest review.
 *
 * Same shape P10 expects: setup config + ordered moves. The core never sees this —
 * `makeMatch(config)` rebuilds the opening, `replay` folds the moves.
 */

import type { MatchConfig, Move, PlayerId } from '@arrows/contracts';

export const MATCH_LOG_VERSION = 1 as const;

export const LAST_MATCH_STORAGE_KEY = 'arrows-conqueror:last-match';

export interface MatchLog {
  readonly version: typeof MATCH_LOG_VERSION;
  readonly config: MatchConfig;
  /** ISO timestamp from the adapter clock — review metadata only. */
  readonly startedAt: string;
  readonly vsBot: boolean;
  readonly humanSeat: PlayerId;
  readonly botSeat: PlayerId | undefined;
  readonly moves: readonly Move[];
  readonly winner: PlayerId | undefined;
}

export const createMatchLog = (args: {
  readonly config: MatchConfig;
  readonly vsBot: boolean;
  readonly humanSeat: PlayerId;
  readonly botSeat: PlayerId | undefined;
  readonly startedAt?: string;
}): MatchLog => ({
  version: MATCH_LOG_VERSION,
  config: args.config,
  startedAt: args.startedAt ?? new Date().toISOString(),
  vsBot: args.vsBot,
  humanSeat: args.humanSeat,
  botSeat: args.botSeat,
  moves: [],
  winner: undefined,
});

export const appendMoves = (log: MatchLog, moves: readonly Move[]): MatchLog => {
  if (moves.length === 0) return log;
  return { ...log, moves: [...log.moves, ...moves] };
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
