/**
 * Trail evaporation FX — pure presentation helper (not rules-core).
 *
 * When a move shrinks any player's open trail, the lost arrows burn away from
 * the cut locus outward so the player can see the two fronts of §6.1 evaporation
 * instead of a silent blink between frames.
 */

import type {
  ArrowId,
  GameState,
  GeometryPort,
  Move,
  PlayerId,
  StepMove,
} from '@arrows/contracts';

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
/** Delay between successive distance rings along the front. */
export const EVAPORATE_STAGGER_MS = 38;
/** Cap so a long wipe does not animate for seconds. */
const MAX_STAGGER_MS = 420;

const stepExits = (moves: readonly Move[]): ArrowId[] => {
  const out: ArrowId[] = [];
  for (const m of moves) {
    if (m.kind === 'step') out.push(m.exit);
  }
  return out;
};

const stableArrowKey = (a: ArrowId): string => String(a);

/** Undirected arrow-adjacency via shared points (presentation BFS). */
const undirectedNeighbours = (
  geometry: GeometryPort,
  arrow: ArrowId,
): ArrowId[] => {
  const out: ArrowId[] = [];
  const seen = new Set<string>();
  for (const point of [geometry.origin(arrow), geometry.target(arrow)]) {
    for (const n of [
      ...geometry.inArrows(point),
      ...geometry.outArrows(point),
    ]) {
      const key = stableArrowKey(n);
      if (seen.has(key) || key === stableArrowKey(arrow)) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return out;
};

/**
 * Distance from `seed` over the lost-arrow subgraph (undirected). Missing
 * arrows get a large sentinel so they sort last.
 */
const distancesFromCut = (
  geometry: GeometryPort,
  seed: ArrowId,
  lostKeys: ReadonlySet<string>,
): Map<string, number> => {
  const dist = new Map<string, number>();
  const seedKey = stableArrowKey(seed);
  if (!lostKeys.has(seedKey)) return dist;
  dist.set(seedKey, 0);
  const queue: ArrowId[] = [seed];
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i];
    if (cur === undefined) continue;
    const d = dist.get(stableArrowKey(cur)) ?? 0;
    for (const n of undirectedNeighbours(geometry, cur)) {
      const nk = stableArrowKey(n);
      if (!lostKeys.has(nk) || dist.has(nk)) continue;
      dist.set(nk, d + 1);
      queue.push(n);
    }
  }
  return dist;
};

/**
 * Diff `before.trails` → `after.trails`. Returns undefined when nothing evaporated.
 *
 * Ordering: BFS distance from the cut exit over the lost subgraph when
 * `geometry` is supplied; otherwise exit-first then stable id order.
 */
export const createEvaporationBurst = (
  before: GameState,
  after: GameState,
  moves: readonly Move[] = [],
  now = Date.now(),
  geometry?: GeometryPort,
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

  const exits = stepExits(moves);
  const exitKeys = new Set(exits.map(stableArrowKey));
  const cutArrow =
    exits.find((exit) =>
      lost.some((l) => stableArrowKey(l.arrow) === stableArrowKey(exit)),
    ) ?? exits[exits.length - 1];

  const lostKeys = new Set(lost.map((l) => stableArrowKey(l.arrow)));
  const byDist =
    geometry !== undefined && cutArrow !== undefined
      ? distancesFromCut(geometry, cutArrow, lostKeys)
      : undefined;

  lost.sort((a, b) => {
    if (byDist !== undefined) {
      const da = byDist.get(stableArrowKey(a.arrow)) ?? 9999;
      const db = byDist.get(stableArrowKey(b.arrow)) ?? 9999;
      if (da !== db) return da - db;
    } else {
      const aCut = exitKeys.has(stableArrowKey(a.arrow)) ? 0 : 1;
      const bCut = exitKeys.has(stableArrowKey(b.arrow)) ? 0 : 1;
      if (aCut !== bCut) return aCut - bCut;
    }
    const ka = stableArrowKey(a.arrow);
    const kb = stableArrowKey(b.arrow);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.player) < String(b.player) ? -1 : String(a.player) > String(b.player) ? 1 : 0;
  });

  const arrows: EvaporatingArrow[] = lost.map((item, i) => {
    const ring =
      byDist?.get(stableArrowKey(item.arrow)) ??
      (exitKeys.has(stableArrowKey(item.arrow)) ? 0 : i);
    return {
      arrow: item.arrow,
      player: item.player,
      delayMs: Math.min(ring * EVAPORATE_STAGGER_MS, MAX_STAGGER_MS),
    };
  });

  const first = lost[0];
  if (first === undefined) return undefined;
  const id = `evap-${String(now)}-${String(lost.length)}-${stableArrowKey(first.arrow)}`;
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
