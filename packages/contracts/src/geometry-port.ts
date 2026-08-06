/**
 * The arrow graph, behind a port.
 *
 * SPEC §2 (the board), §7 (specials live on vertices).
 *
 * This is the only thing the rules core knows about the board. Every method
 * returns already-correct neighbours: **no coordinate, no distance and no board
 * extent is on this port**, because a rule that could ask where it is on the
 * board would be a rule that could special-case it.
 *
 * Two implementations must satisfy the same conformance suite — hand-authored
 * fixture boards (P02) and the generated tiling (P03). That is not a stylistic
 * preference: rules packets test against small boards with known adjacency,
 * which make failures readable, and the generated board answers the same suite.
 * No geometric fact is outstanding — SPEC §11 item 1 resolved to alternating —
 * so P03 generates rather than measures, and the port outlives the reason it
 * was introduced.
 *
 * **The board is unbounded** (SPEC §2, §11 item 4). Adjacency is total, so
 * every query below answers everywhere; what is *not* available is "all of it".
 * See {@link BoardWindow}.
 *
 * @see docs/spec/geometry-port/geometry-port.md
 */

import type { ArrowId, PointId, Slot, VertexId } from './ids';

/**
 * A bounded region of the board — the only way to enumerate anything.
 *
 * SPEC §11 item 4 made the board the unbounded lattice, so `allPoints()` and
 * its siblings are gone. They were never quite honest anyway: *enumerate the
 * whole board* is a statement about a representation, and this port exists to
 * hide the representation.
 *
 * A window is a **graph-distance ball**, which is definable from adjacency
 * alone and therefore means the same thing on a generated lattice and on an
 * abstract fixture digraph. On a fixture small enough, a large enough radius
 * simply yields the whole board.
 *
 * Membership is deliberately *inclusive at the fringe*, so the three lists are
 * closed under the incidence a caller is likely to follow:
 *
 * - every arrow incident to a point in `points` is in `arrows`
 * - every vertex flanked by an arrow in `arrows` is in `vertices`
 *
 * The converse does **not** hold and must not be assumed: a fringe arrow may
 * have an endpoint outside `points`, and a fringe vertex may have a bordering
 * arrow outside `arrows`. A window has an inside and an edge; only the inside
 * is complete.
 */
export interface BoardWindow {
  /** The point the ball was grown from. */
  readonly centre: PointId;
  /** How many steps out it reaches. */
  readonly radius: number;
  /**
   * Every point within `radius` steps of `centre`, following arrows in either
   * direction. Order must be stable — see {@link GeometryPort.window}.
   */
  readonly points: readonly PointId[];
  /** Every arrow with at least one endpoint in `points`. */
  readonly arrows: readonly ArrowId[];
  /** Every vertex flanked by at least one arrow in `arrows`. */
  readonly vertices: readonly VertexId[];
}

export interface GeometryPort {
  /**
   * A point to start from, so that a sweep has somewhere to begin.
   *
   * **This is not "the centre of the board" and carries no meaning.** SPEC §2's
   * centre is a *setup* concept — it is where the spawner gradient peaks — and
   * setup builds on a concrete tiling, not on this port. Nothing in the rules
   * core may attach significance to which point comes back; it exists because
   * an unbounded board gives a caller no other way to name a first point, and
   * because an abstract fixture board cannot have its ids guessed.
   */
  seedPoint(): PointId;

  /**
   * Enumerate a bounded region. Fill (SPEC §7) sweeps a region of the board
   * through this port and must not know how the board is represented.
   *
   * Order must be stable across calls, and two ports built from the same
   * description must return identical windows. ADR 0001 names ordering — not
   * randomness — as the realistic determinism failure: a port that returns a
   * different order on two calls produces a rules engine that passes every unit
   * test and drifts in replay.
   *
   * @throws ContractViolation if `radius` is negative or not an integer.
   */
  window(centre: PointId, radius: number): BoardWindow;

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
