/**
 * The generated board — SKELETON.
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
 *
 * Phase 2: signatures only. Every method throws.
 */

import { ContractViolation } from '@arrows/contracts';
import type { ArrowId, BoardWindow, GeometryPort, PointId, Slot, VertexId } from '@arrows/contracts';

const notImplemented = (method: string): never => {
  throw new Error(`geometry-tiling: ${method} is not implemented (P03 phase 3)`);
};

/**
 * The unbounded oriented triangular lattice, behind `GeometryPort`.
 *
 * Takes no arguments: there is no size, no modulus and no seed. Two calls
 * return boards that agree exactly, because there is nothing for them to
 * disagree about.
 */
export const makeTiling = (): GeometryPort => ({
  seedPoint: (): PointId => notImplemented('seedPoint'),

  window: (_centre: PointId, _radius: number): BoardWindow => notImplemented('window'),

  inArrows: (_point: PointId): readonly ArrowId[] => notImplemented('inArrows'),
  outArrows: (_point: PointId): readonly ArrowId[] => notImplemented('outArrows'),

  origin: (_arrow: ArrowId): PointId => notImplemented('origin'),
  target: (_arrow: ArrowId): PointId => notImplemented('target'),

  flankVertices: (_arrow: ArrowId): readonly VertexId[] => notImplemented('flankVertices'),
  borderArrows: (_vertex: VertexId): readonly ArrowId[] => notImplemented('borderArrows'),

  slotOf: (_point: PointId, _arrow: ArrowId): Slot => notImplemented('slotOf'),
});

/**
 * Re-exported so a caller that already has a `ContractViolation` in scope does
 * not need a second import to assert on rejections. Phase 3 will use it for the
 * radius and foreign-identifier guards.
 */
export { ContractViolation };
