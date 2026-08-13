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

import { ContractViolation, mintArrowId, mintPointId, mintVertexId } from '@conquarrow/contracts';
import type { ArrowId, PointId, VertexId } from '@conquarrow/contracts';

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
  { di: 1, dj: 0 }, // lattice 0° — east; layout turns this to screen-up
  { di: -1, dj: 1 }, // lattice 120°
  { di: 0, dj: -1 }, // lattice 240°
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

const POINT_RE = /^tiling:p:(-?\d+),(-?\d+)$/;
const ARROW_RE = /^tiling:a:(-?\d+),(-?\d+),([012])$/;
const VERTEX_RE = /^tiling:v:(-?\d+),(-?\d+),(up|down)$/;

export interface Cell {
  readonly i: number;
  readonly j: number;
}

export interface ArrowCell extends Cell {
  readonly d: Direction;
}

export interface VertexCell extends Cell {
  readonly parity: TriangleParity;
}

/**
 * Decoding is where a foreign identifier is caught.
 *
 * A fixture board (P02) and this tiling coexist in one test run, and an id
 * minted against one must never resolve against the other. Returning a
 * plausible-looking answer here would surface turns later as a replay mismatch,
 * which is the hardest possible place to find it.
 */
export const pointCell = (point: PointId): Cell => {
  const m = POINT_RE.exec(String(point));
  if (m === null) throw new ContractViolation(`not a point of this tiling: ${String(point)}`);
  return { i: Number(m[1]), j: Number(m[2]) };
};

export const arrowCell = (arrow: ArrowId): ArrowCell => {
  const m = ARROW_RE.exec(String(arrow));
  if (m === null) throw new ContractViolation(`not an arrow of this tiling: ${String(arrow)}`);
  return { i: Number(m[1]), j: Number(m[2]), d: Number(m[3]) as Direction };
};

export const vertexCell = (vertex: VertexId): VertexCell => {
  const m = VERTEX_RE.exec(String(vertex));
  if (m === null) throw new ContractViolation(`not a vertex of this tiling: ${String(vertex)}`);
  return { i: Number(m[1]), j: Number(m[2]), parity: m[3] as TriangleParity };
};

/** Whether a vertex is its cell's up-triangle or its down-triangle. */
export const vertexParity = (vertex: VertexId): TriangleParity => vertexCell(vertex).parity;

/**
 * The two triangles an arrow runs between — **always one up and one down**,
 * never two of a kind.
 *
 * That is what makes SPEC §7's cap of two feed slots per arrow a fact about the
 * geometry rather than a rule anything has to enforce. Derived by asking which
 * two lattice triangles contain the arrow's edge:
 *
 * ```
 * up(i,j)   = { (i,j), (i+1,j), (i,j+1) }        centroid (i+⅓, j+⅓)
 * down(i,j) = { (i+1,j), (i,j+1), (i+1,j+1) }    centroid (i+⅔, j+⅔)
 * ```
 */
export const arrowFlanks = ({ i, j, d }: ArrowCell): readonly [VertexCell, VertexCell] => {
  if (d === 0) {
    return [
      { i, j, parity: 'up' },
      { i, j: j - 1, parity: 'down' },
    ];
  }
  if (d === 1) {
    return [
      { i: i - 1, j, parity: 'up' },
      { i: i - 1, j, parity: 'down' },
    ];
  }
  return [
    { i, j: j - 1, parity: 'up' },
    { i: i - 1, j: j - 1, parity: 'down' },
  ];
};

/**
 * The three arrows bordering a triangle — the inverse of {@link arrowFlanks},
 * and in both cases a **directed 3-cycle**.
 *
 * That every triangle circulates is what makes girth 3 and the one-vertex
 * correspondence (SPEC §11 item 16) hold, and it is why every point lies on
 * exactly six minimal cycles: a lattice point corners six triangles.
 */
export const vertexBorders = ({ i, j, parity }: VertexCell): readonly [ArrowCell, ArrowCell, ArrowCell] =>
  parity === 'up'
    ? [
        { i, j, d: 0 }, //     (i,j)   -> (i+1,j)
        { i: i + 1, j, d: 1 }, // (i+1,j) -> (i,j+1)
        { i, j: j + 1, d: 2 }, // (i,j+1) -> (i,j)
      ]
    : [
        { i, j: j + 1, d: 0 }, //     (i,j+1)   -> (i+1,j+1)
        { i: i + 1, j: j + 1, d: 2 }, // (i+1,j+1) -> (i+1,j)
        { i: i + 1, j, d: 1 }, //     (i+1,j)   -> (i,j+1)
      ];
