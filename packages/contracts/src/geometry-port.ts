/**
 * The arrow graph, behind a port.
 *
 * SPEC §2 (the board), §7 (specials live on vertices).
 *
 * This is the only thing the rules core knows about the board. Every method
 * returns already-correct neighbours: **the torus wrap is not on this port**
 * and there is no seam to query, because a rule that could ask where the seam
 * is would be a rule that could special-case it.
 *
 * Two implementations must satisfy the same conformance suite — hand-authored
 * fixture boards (P02) and the generated tiling (P03). That is not a stylistic
 * preference: SPEC §11 item 1 is still unmeasured, so the rules have to be
 * buildable and testable before the real tiling exists.
 *
 * @see docs/spec/geometry-port/geometry-port.md
 */

import type { ArrowId, PointId, Slot, VertexId } from './ids';

export interface GeometryPort {
  /**
   * Enumeration. Even-odd fill (SPEC §7) sweeps the board through this port and
   * must not know how the board is represented.
   *
   * Order must be stable across calls. ADR 0001 names ordering — not
   * randomness — as the realistic determinism failure: a port that returns a
   * different order on two calls produces a rules engine that passes every unit
   * test and drifts in replay.
   */
  allPoints(): readonly PointId[];
  allArrows(): readonly ArrowId[];
  allVertices(): readonly VertexId[];

  /** Exactly 3 each, at every point, everywhere on the board. */
  inArrows(point: PointId): readonly ArrowId[];
  outArrows(point: PointId): readonly ArrowId[];

  origin(arrow: ArrowId): PointId;
  target(arrow: ArrowId): PointId;

  /**
   * The two spawner vertices on an arrow's left and right. Always exactly 2 —
   * an arrow touches exactly four interesting things, so a triple-fed arrow is
   * impossible and the economy never has to consider one.
   */
  flankVertices(arrow: ArrowId): readonly VertexId[];

  /** Exactly 3. The inverse of `flankVertices`. */
  borderArrows(vertex: VertexId): readonly ArrowId[];

  /**
   * Where an arrow sits in a point's cyclic order of six slots.
   *
   * Exposed rather than hidden behind an opaque crossing verdict: the chord
   * test is the thing most likely to be wrong, and an opaque verdict is the
   * hardest possible thing to debug.
   */
  slotOf(point: PointId, arrow: ArrowId): Slot;
}
