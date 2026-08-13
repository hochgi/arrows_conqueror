/**
 * The generated board.
 *
 * SPEC §2 (the board, the formal definition, *the board is unbounded*), §11
 * items 1, 4, 5, 16, 29. P03 decision D6.
 *
 * > **The board is a constant, not a construction.** `makeTiling()` takes no
 * > arguments and returns a `GeometryPort` over the oriented triangular
 * > lattice, unbounded.
 *
 * **Stateless by necessity, which is worth more than it sounds.** An unbounded
 * board cannot be precomputed, so every answer is arithmetic on the identifier
 * handed in. ADR 0001 names iteration order over a precomputed collection as
 * the realistic determinism failure in this repo; a generator with no
 * collection cannot have one.
 */

import { ContractViolation } from '@conquarrow/contracts';
import type { ArrowId, BoardWindow, GeometryPort, PointId, Slot, VertexId } from '@conquarrow/contracts';
import {
  DIRECTIONS,
  OUT_DIRECTIONS,
  arrowCell,
  arrowFlanks,
  cellArrow,
  cellPoint,
  cellVertex,
  pointCell,
  vertexBorders,
  vertexCell,
} from './cells';
import type { ArrowCell, Cell, Direction, VertexCell } from './cells';

const reject = (message: string): never => {
  throw new ContractViolation(message);
};

/**
 * Where each arrow sits in a point's cyclic order of six slots, by world angle:
 * `0°, 60°, … 300°` map to `0 … 5`.
 *
 * An out-arrow along direction `d` leaves at 0°/120°/240°, so out-arrows take
 * the **even** slots. An in-arrow along direction `d` arrives *from* `-OUT[d]`,
 * so it lies at 180°/300°/60° and in-arrows take the **odd** ones.
 *
 * The alternation is a conformance requirement (§11 item 29). The **phase is
 * not** — that in-arrows land on the odd slots here is this lattice's accident,
 * and nothing may depend on it.
 */
const OUT_SLOT: readonly Slot[] = [0, 2, 4];
const IN_SLOT: readonly Slot[] = [3, 5, 1];

const stepFrom = ({ i, j }: Cell, d: Direction): Cell => ({
  i: i + OUT_DIRECTIONS[d].di,
  j: j + OUT_DIRECTIONS[d].dj,
});

const stepBack = ({ i, j }: Cell, d: Direction): Cell => ({
  i: i - OUT_DIRECTIONS[d].di,
  j: j - OUT_DIRECTIONS[d].dj,
});

const asPoint = ({ i, j }: Cell): PointId => cellPoint(i, j);
const asArrow = ({ i, j, d }: ArrowCell): ArrowId => cellArrow(i, j, d);
const asVertex = ({ i, j, parity }: VertexCell): VertexId => cellVertex(i, j, parity);

const outsOf = (c: Cell): readonly ArrowId[] => DIRECTIONS.map((d) => cellArrow(c.i, c.j, d));

const insOf = (c: Cell): readonly ArrowId[] =>
  DIRECTIONS.map((d) => {
    const from = stepBack(c, d);
    return cellArrow(from.i, from.j, d);
  });

/**
 * Grow a graph-distance ball.
 *
 * Breadth-first from the centre, following arrows in both directions, with
 * neighbours visited in a fixed order — out-arrows by direction, then
 * in-arrows by direction. That makes the result a **pure function of the
 * centre and the radius**: no `Set` iteration order, no sort with a partial
 * comparator, and nothing carried between calls.
 */
const growWindow = (centre: PointId, radius: number): BoardWindow => {
  if (!Number.isInteger(radius) || radius < 0) {
    reject(`window radius must be a whole number of steps, not ${String(radius)}`);
  }
  const start = pointCell(centre);

  const points: PointId[] = [centre];
  const seen = new Set<PointId>([centre]);
  let frontier: Cell[] = [start];

  for (let step = 0; step < radius; step += 1) {
    const next: Cell[] = [];
    for (const cell of frontier) {
      const neighbours = [
        ...DIRECTIONS.map((d) => stepFrom(cell, d)),
        ...DIRECTIONS.map((d) => stepBack(cell, d)),
      ];
      for (const n of neighbours) {
        const id = asPoint(n);
        if (!seen.has(id)) {
          seen.add(id);
          points.push(id);
          next.push(n);
        }
      }
    }
    frontier = next;
  }

  // Inclusive at the fringe, in one direction only: every arrow touching a
  // window point is here, and every vertex flanked by one of those arrows. The
  // converse is deliberately NOT true — a fringe arrow points out of the
  // window, which is what makes this a window rather than a board.
  const arrows: ArrowId[] = [];
  const arrowSeen = new Set<ArrowId>();
  for (const p of points) {
    const cell = pointCell(p);
    for (const a of [...outsOf(cell), ...insOf(cell)]) {
      if (!arrowSeen.has(a)) {
        arrowSeen.add(a);
        arrows.push(a);
      }
    }
  }

  const vertices: VertexId[] = [];
  const vertexSeen = new Set<VertexId>();
  for (const a of arrows) {
    for (const v of arrowFlanks(arrowCell(a))) {
      const id = asVertex(v);
      if (!vertexSeen.has(id)) {
        vertexSeen.add(id);
        vertices.push(id);
      }
    }
  }

  return { centre, radius, points, arrows, vertices };
};

/**
 * The unbounded oriented triangular lattice, behind `GeometryPort`.
 *
 * Takes no arguments: there is no size, no modulus and no seed. Two calls
 * return boards that agree exactly, because there is nothing for them to
 * disagree about.
 */
export const makeTiling = (): GeometryPort => ({
  // Not "the centre of the board" — the board has none, and SPEC §2's centre is
  // a setup concept that lives on the gradient, not on the port. This exists so
  // that a sweep has somewhere to start.
  seedPoint: (): PointId => cellPoint(0, 0),

  window: (centre: PointId, radius: number): BoardWindow => growWindow(centre, radius),

  inArrows: (point: PointId): readonly ArrowId[] => insOf(pointCell(point)),
  outArrows: (point: PointId): readonly ArrowId[] => outsOf(pointCell(point)),

  origin: (arrow: ArrowId): PointId => {
    const { i, j } = arrowCell(arrow);
    return cellPoint(i, j);
  },

  target: (arrow: ArrowId): PointId => {
    const a = arrowCell(arrow);
    return asPoint(stepFrom(a, a.d));
  },

  flankVertices: (arrow: ArrowId): readonly VertexId[] =>
    arrowFlanks(arrowCell(arrow)).map(asVertex),

  borderArrows: (vertex: VertexId): readonly ArrowId[] =>
    vertexBorders(vertexCell(vertex)).map(asArrow),

  slotOf: (point: PointId, arrow: ArrowId): Slot => {
    const p = pointCell(point);
    const a = arrowCell(arrow);
    if (a.i === p.i && a.j === p.j) return OUT_SLOT[a.d] as Slot;
    const arrives = stepFrom(a, a.d);
    if (arrives.i === p.i && arrives.j === p.j) return IN_SLOT[a.d] as Slot;
    return reject(`arrow ${String(arrow)} is not incident to point ${String(point)}`);
  },
});

export { ContractViolation };
