/**
 * The lattice constants and the identifier codec.
 *
 * SPEC §2, *the generator constants, confirmed against the artwork*. P03
 * decisions D1 and D2.
 *
 * This module is **real in phase 2, deliberately**. It mints names and holds
 * two decided constants; it computes no adjacency and answers no query. Leaving
 * it a skeleton would make every behavioural test fail while constructing its
 * inputs, which is exactly the "red for a setup reason" the phase-2 rules
 * forbid — a failure that goes green in phase 3 without the behaviour ever
 * being written.
 */

import { mintArrowId, mintPointId, mintVertexId } from '@arrows/contracts';
import type { ArrowId, PointId, VertexId } from '@arrows/contracts';

/** Which of the three out-directions an arrow follows. */
export type Direction = 0 | 1 | 2;

export const DIRECTIONS: readonly Direction[] = [0, 1, 2];

/** Which of the two triangles a cell owns. Invisible to the port; layout needs it. */
export type TriangleParity = 'up' | 'down';

export const PARITIES: readonly TriangleParity[] = ['up', 'down'];

export interface LatticeVector {
  readonly di: number;
  readonly dj: number;
}

/**
 * The three out-directions, in lattice coordinates over basis
 * `u = (1, 0)`, `v = (½, √3⁄2)`.
 *
 * **These must satisfy two conditions and it is easy to pick a set that
 * satisfies only one.** They sum to zero, so the directed 3-cycle closes and
 * girth is 3; and they sit 120° apart in world space, so the board is
 * mirror-symmetric rather than skewed.
 *
 * `{(1,0), (0,1), (-1,-1)}` also sums to zero, is the same graph under an
 * `SL₂(ℤ)` change of basis, and passes **every assertion in the conformance
 * suite** while rendering at 0°/60°/210°. No rule can see the difference. Only
 * layout can, which is why layout is specified in this packet.
 */
export const OUT_DIRECTIONS: readonly [LatticeVector, LatticeVector, LatticeVector] = [
  { di: 1, dj: 0 }, // world 0°   — east
  { di: -1, dj: 1 }, // world 120° — up-left
  { di: 0, dj: -1 }, // world 240° — down-left
];

/** Where a cell's two triangles sit, as a fraction of the cell. P03 D2. */
export const TRIANGLE_OFFSET: Readonly<Record<TriangleParity, number>> = {
  up: 1 / 3,
  down: 2 / 3,
};

const POINT_TAG = 'tiling:p';
const ARROW_TAG = 'tiling:a';
const VERTEX_TAG = 'tiling:v';

/**
 * Ids are opaque to the port (P01 D1) but this package mints them, so it needs
 * a codec. Tagged so that an id from a fixture board (P02) cannot be mistaken
 * for one of ours — the conformance suite asserts exactly that.
 */
export const cellPoint = (i: number, j: number): PointId =>
  mintPointId(`${POINT_TAG}:${String(i)},${String(j)}`);

export const cellArrow = (i: number, j: number, d: Direction): ArrowId =>
  mintArrowId(`${ARROW_TAG}:${String(i)},${String(j)},${String(d)}`);

export const cellVertex = (i: number, j: number, parity: TriangleParity): VertexId =>
  mintVertexId(`${VERTEX_TAG}:${String(i)},${String(j)},${parity}`);
