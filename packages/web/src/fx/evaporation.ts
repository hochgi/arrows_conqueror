/**
 * Trail evaporation FX — pure presentation helper (not rules-core).
 *
 * When a move shrinks any player's open trail, the lost arrows burn away from
 * the cut locus outward so the player can see the two fronts of §5 evaporation
 * instead of a silent blink between frames.
 */

import type { ArrowId, GameState, Move, PlayerId, StepMove } from '@arrows/contracts';

export interface EvaporatingArrow {
  readonly arrow: ArrowId;
  /** Player who lost this trail cell. */
  readonly player: PlayerId;
  /** Stagger delay from the cut (ms). */
  readonly delayMs: number;
}

export interface EvaporationBurst {
  readonly id: string;
  /** Arrow that most likely caused the cut (step exit), if known. */
  readonly cutArrow: ArrowId | undefined;
  readonly arrows: readonly EvaporatingArrow[];
  /** Wall-clock start; used to prune expired bursts. */
  readonly startedAt: number;
}

/** Visible duration of one cell's burn (matches CSS). */
export const EVAPORATE_MS = 560;
/** Extra hold so the last staggered cell finishes cleanly. */
export const EVAPORATE_TAIL_MS = 120;
/** Delay between successive cells along the front. */
export const EVAPORATE_STAGGER_MS = 38;

const stepExits = (moves: readonly Move[]): ArrowId[] => {
  const out: ArrowId[] = [];
  for (const m of moves) {
    if (m.kind === 'step') out.push(m.exit);
  }
  return out;
};

const stableArrowKey = (a: ArrowId): string => String(a);

/**
 * Diff `before.trails` → `after.trails`. Returns undefined when nothing evaporated.
 *
 * Ordering: prefer arrows that were step exits (the cut landings), then stable
 * id order. Stagger delay grows with that order so the burn reads as a front.
 */
export const createEvaporationBurst = (
  before: GameState,
  after: GameState,
  moves: readonly Move[] = [],
  now = Date.now(),
): EvaporationBurst | undefined => {
  const lost: { arrow: ArrowId; player: PlayerId }[] = [];
  for (const [player, set] of before.trails) {
    const afterSet = after.trails.get(player);
    for (const arrow of set) {
      if (afterSet?.has(arrow) === true) continue;
      lost.push({ arrow, player });
    }
  }
  if (lost.length === 0) return undefined;

  const exits = new Set(stepExits(moves).map(stableArrowKey));
  const cutArrow =
    stepExits(moves).find((exit) =>
      lost.some((l) => stableArrowKey(l.arrow) === stableArrowKey(exit)),
    ) ?? stepExits(moves)[stepExits(moves).length - 1];

  lost.sort((a, b) => {
    const aCut = exits.has(stableArrowKey(a.arrow)) ? 0 : 1;
    const bCut = exits.has(stableArrowKey(b.arrow)) ? 0 : 1;
    if (aCut !== bCut) return aCut - bCut;
    const ka = stableArrowKey(a.arrow);
    const kb = stableArrowKey(b.arrow);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.player) < String(b.player) ? -1 : String(a.player) > String(b.player) ? 1 : 0;
  });

  const arrows: EvaporatingArrow[] = lost.map((item, i) => ({
    arrow: item.arrow,
    player: item.player,
    delayMs: Math.min(i * EVAPORATE_STAGGER_MS, 420),
  }));

  const id = `evap-${String(now)}-${String(lost.length)}-${stableArrowKey(lost[0]!.arrow)}`;
  return {
    id,
    cutArrow,
    arrows,
    startedAt: now,
  };
};

/** Lifetime of a burst including the slowest staggered cell. */
export const burstLifetimeMs = (burst: EvaporationBurst): number => {
  let maxDelay = 0;
  for (const a of burst.arrows) maxDelay = Math.max(maxDelay, a.delayMs);
  return EVAPORATE_MS + EVAPORATE_TAIL_MS + maxDelay;
};

/** True while the CSS burn for this cell should still be on screen. */
export const cellStillVisible = (
  burst: EvaporationBurst,
  cell: EvaporatingArrow,
  now: number,
): boolean => now - burst.startedAt < cell.delayMs + EVAPORATE_MS + EVAPORATE_TAIL_MS;

/** Drop finished bursts. Pure. */
export const pruneBursts = (
  bursts: readonly EvaporationBurst[],
  now = Date.now(),
): readonly EvaporationBurst[] =>
  bursts.filter((b) => now - b.startedAt < burstLifetimeMs(b));

/** Convenience: last step in a batch, if any. */
export const lastStep = (moves: readonly Move[]): StepMove | undefined => {
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    const m = moves[i];
    if (m?.kind === 'step') return m;
  }
  return undefined;
};
