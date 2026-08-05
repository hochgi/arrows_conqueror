/**
 * `makeFixture` — a `GeometryPort` over a hand-authored finite digraph.
 *
 * SPEC §2, §7. P02 D1, D2, D5.
 *
 * The sibling of `makeTiling`: same port, same conformance suite, authored
 * rather than generated. From a board's rotation system it will derive the arrow
 * graph, enumerate minimal directed 3-cycles to mint the spawner-vertex lattice,
 * validate the whole thing at construction (D2 — a malformed board fails loudly
 * where it is written, naming the offending point or arrow), and answer every
 * `GeometryPort` query.
 *
 * ── Phase-2 skeleton ──────────────────────────────────────────────────────────
 * This file is **the surface, not the behaviour**. `makeFixture` returns a port
 * whose every method throws a *plain* `Error('not implemented')`, and it does
 * **no validation** yet.
 *
 * The plain `Error` is deliberate and load-bearing (see `contracts/src/errors.ts`):
 * the rejection tests assert `toThrow(ContractViolation)`, so against this
 * skeleton they are red until the real check exists — a `ContractViolation`
 * thrown here would make them pass without testing anything. The construction
 * tests, symmetrically, expect `makeFixture(bad)` to throw; a skeleton that does
 * not validate simply returns a stub, so those tests are red because nothing is
 * thrown. Both are red for the right reason: missing behaviour, not a stub that
 * happens to satisfy the assertion.
 *
 * There is deliberately **no dependency on `@arrows/geometry-tiling`** (P02 DoD):
 * a fixture must stand entirely on `@arrows/contracts`, so that the two port
 * implementations are genuinely independent evidence for interchangeability.
 */

import type { ArrowId, BoardWindow, GeometryPort, PointId, Slot, VertexId } from '@arrows/contracts';
import type { BoardDescription } from './boards';

const unimplemented = (): never => {
  throw new Error('not implemented');
};

/**
 * Build a `GeometryPort` from a rotation system.
 *
 * Two ports built from the same description must agree exactly — same seed, same
 * windows, same derived vertex ids — because every id is minted from a canonical
 * key rather than from map-insertion order (P02 D5). That determinism is
 * behaviour, so it is unimplemented here.
 *
 * @throws ContractViolation — once implemented — if the board is malformed (D2).
 */
export const makeFixture = (_description: BoardDescription): GeometryPort => ({
  seedPoint: (): PointId => unimplemented(),

  window: (_centre: PointId, _radius: number): BoardWindow => unimplemented(),

  inArrows: (_point: PointId): readonly ArrowId[] => unimplemented(),
  outArrows: (_point: PointId): readonly ArrowId[] => unimplemented(),

  origin: (_arrow: ArrowId): PointId => unimplemented(),
  target: (_arrow: ArrowId): PointId => unimplemented(),

  flankVertices: (_arrow: ArrowId): readonly VertexId[] => unimplemented(),
  borderArrows: (_vertex: VertexId): readonly ArrowId[] => unimplemented(),

  slotOf: (_point: PointId, _arrow: ArrowId): Slot => unimplemented(),
});
