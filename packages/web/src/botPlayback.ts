/**
 * Local AI move playback — plan once, apply with an injected gap.
 */

import type { GameState, Move, RulesPort } from '@conquarrow/contracts';

export const BOT_PLAYBACK_GAP_MS = 400;

export function localAiChairKey(
  state: GameState | undefined,
  opts: { online: boolean; isAiSeat: (id: string) => boolean },
): string | null {
  if (state === undefined || opts.online || state.winner !== undefined) {
    return null;
  }
  const key = String(state.activePlayer);
  if (!opts.isAiSeat(key)) return null;
  return key;
}

export async function applyMovesSequentially(
  rules: RulesPort,
  start: GameState,
  moves: readonly Move[],
  opts: {
    gapMs: number;
    sleep: (ms: number) => Promise<void>;
    onApplied: (move: Move, after: GameState, index: number) => void;
    cancelled: () => boolean;
  },
): Promise<GameState> {
  let at = start;
  let index = 0;
  for (const move of moves) {
    if (opts.cancelled()) return at;
    at = rules.apply(at, move);
    opts.onApplied(move, at, index);
    if (index < moves.length - 1) {
      if (opts.cancelled()) return at;
      await opts.sleep(opts.gapMs);
    }
    index += 1;
  }
  return at;
}
