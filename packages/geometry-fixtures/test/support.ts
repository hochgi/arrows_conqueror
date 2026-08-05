/**
 * Test-only knowledge of the two boards.
 *
 * Not exported from the package, and — importantly — **not on `GeometryPort`**.
 * A board's size and diameter are finite-board facts the *test author* knows
 * because the boards are hand-authored; the port must never reveal them (the
 * "board exposes no extent" rule), so they live here rather than being queried.
 *
 * `size` and `diameter` were verified against the authored rotation systems:
 * `minimal` is the tournament on ℤ/7 (7 points, undirected diameter 1, `K₇`);
 * `spacious` is `⟨(4,0),(1,2)⟩` (8 points, undirected diameter 2).
 */

import type { ArrowId, GeometryPort, PointId, Slot } from '@arrows/contracts';
import type { BoardDescription } from '../src/index';
import { MINIMAL, SPACIOUS } from '../src/index';

export interface BoardCase {
  readonly label: string;
  readonly description: BoardDescription;
  /** How many points the whole board has. */
  readonly size: number;
  /** The largest undirected graph distance between two of its points. */
  readonly diameter: number;
}

export const MINIMAL_CASE: BoardCase = { label: 'minimal', description: MINIMAL, size: 7, diameter: 1 };
export const SPACIOUS_CASE: BoardCase = { label: 'spacious', description: SPACIOUS, size: 8, diameter: 2 };

export const BOARDS: readonly BoardCase[] = [MINIMAL_CASE, SPACIOUS_CASE];

/**
 * One straight-ahead step of a ray: enter a point by `arrow`, leave by the arrow
 * on the opposite slot.
 *
 * `arrow` arrives at `target(arrow)` on some in-slot `s`; slot `s + 3` (mod 6) is
 * the out-slot directly opposite, and alternation guarantees it is an out-slot.
 * Following it repeatedly traces the ray even-odd fill would cast — a map from
 * arrows to arrows, defined through the port with no coordinates.
 */
export const straightAhead = (g: GeometryPort, arrow: ArrowId): ArrowId => {
  const point = g.target(arrow);
  const opposite = ((g.slotOf(point, arrow) + 3) % 6) as Slot;
  const next = g.outArrows(point).find((out) => g.slotOf(point, out) === opposite);
  if (next === undefined) {
    throw new Error('no arrow on the opposite slot — the board is not alternating');
  }
  return next;
};

export type { ArrowId, PointId };
