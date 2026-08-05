/**
 * Trails, branch anchors and crossings.
 *
 * SPEC §5 (the safety rule, branching costs an anchor), §6.1a (a trail is a set,
 * all-to-all points), §6.1 (the two grades of anchor), §2 (the chord test).
 * P05 decisions D1–D9.
 *
 * Purity applies from the first line: no clock, no randomness, no I/O, no mutation
 * of an input state. The realistic risk here is not `Math.random` but **iteration
 * order** — a trail is a `Set` and a chord list is an ordered answer derived from
 * one, which is the exact shape ADR 0001 warns about. Two habits keep it out:
 *
 * - Every list of trail arrows is read off `GeometryPort` and *filtered* by the
 *   set, never iterated from it. The port's order is authored and stable, so a
 *   chord list is a function of the board rather than of how a test happened to
 *   build its state.
 * - Every trail set this file returns is rebuilt **sorted**, unconditionally.
 *   Iteration order is observable, so two states that differ only in insertion
 *   order would otherwise yield outputs that differ only in iteration order —
 *   which passes every unit test and surfaces as replay drift.
 *
 * Nothing here reads a vertex. A special is owned in thirds by its three bordering
 * arrows (§7, §11 item 34), so vertex ownership is a *reading* of tile ownership,
 * and this packet owns no tiles.
 *
 * @see docs/spec/trails/trails.md
 * @see docs/spec/crossings/crossings.md
 */

import { ContractViolation, chord, chordsCross, chordsInterleave } from '@arrows/contracts';
import type {
  AnchorGrade,
  ArrowId,
  Chord,
  GameState,
  GeometryPort,
  PlayerId,
  PointId,
  StepMove,
  Traversal,
} from '@arrows/contracts';
import { compareArrows } from './order';

/**
 * Refuse. Local rather than imported for the same reason as in `movement.ts`:
 * `reject` is internal to `@arrows/contracts` and the error *type* is the public
 * part of it.
 */
const reject = (message: string): never => {
  throw new ContractViolation(message);
};

/** A player with no trail. Shared so the empty case allocates nothing and reads once. */
const NO_TRAIL: ReadonlySet<ArrowId> = new Set<ArrowId>();

/**
 * A branch a step would leave with no head on it: which point, which kind, and the
 * arrow that owes the head (§5).
 *
 * Named parts rather than a formatted string, so the caller decides whether this
 * becomes a refusal message or a filter.
 */
export interface UnpaidBranch {
  readonly kind: 'join' | 'split';
  readonly point: PointId;
  readonly anchor: ArrowId;
}

/** The four `RulesPort` methods P05 adds, plus the two hooks `apply` needs. */
export interface TrailRules {
  /**
   * The trail after a step has landed: the destination is marked unless it is
   * already the mover's own territory (§5, P05 D3).
   */
  readonly markStep: (state: GameState, move: StepMove, mover: PlayerId) => GameState['trails'];
  /**
   * The branch a step would leave unpaid, or `undefined` when it owes nothing
   * (§5, P05 D6).
   *
   * Local to what the move changes, never a standing invariant over the trail —
   * damage can legally empty a branch point, and a whole-trail check would make
   * every later move illegal.
   *
   * A **verdict rather than a refusal**, because both halves of `RulesPort` need it:
   * `apply` turns it into a `ContractViolation` and `legalMoves` uses it to withhold
   * the move. One computation, so the offer and the refusal cannot disagree — the
   * port promises that anything it names, it accepts.
   */
  readonly unpaidBranch: (
    state: GameState,
    move: StepMove,
    mover: PlayerId,
  ) => UnpaidBranch | undefined;
  /** {@link unpaidBranch}, as the refusal `apply` owes the caller. */
  readonly requireBranchAnchors: (state: GameState, move: StepMove, mover: PlayerId) => void;
  readonly trailChordsAt: (
    state: GameState,
    point: PointId,
    player: PlayerId,
  ) => readonly Chord[];
  readonly crossesTrail: (state: GameState, traversal: Traversal, victim: PlayerId) => boolean;
  readonly selfCrosses: (state: GameState, traversal: Traversal, mover: PlayerId) => boolean;
  readonly anchorGrade: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade;
}

/**
 * Build the trail rules over a board.
 *
 * The board arrives as a `GeometryPort` and nothing else, so `slotOf` is asked for
 * every chord endpoint rather than inferred from an arrow id — which is the one
 * thing that would pass on the generated tiling and fail on a fixture.
 */
export const makeTrailRules = (geometry: GeometryPort): TrailRules => {
  const trailOf = (state: GameState, player: PlayerId): ReadonlySet<ArrowId> =>
    state.trails.get(player) ?? NO_TRAIL;

  /** A set rebuilt in arrow-id order, deduplicated — a trail is a set (§6.1a). */
  const canonical = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> =>
    new Set([...new Set(arrows)].toSorted(compareArrows));

  /**
   * Every arrow at a point, in the board's own order.
   *
   * All six of them, in and out both: trail connectivity is **undirected** (§6.1,
   * P05 D7), so an arrow's neighbours are everything sharing one of its two points.
   */
  const arrowsAt = (point: PointId): readonly ArrowId[] => [
    ...geometry.inArrows(point),
    ...geometry.outArrows(point),
  ];

  // ── marking ────────────────────────────────────────────────────────────────

  /**
   * What a step marks: the **destination**, unless the destination is already the
   * mover's own territory (§5's safety rule, P05 D3).
   *
   * One test on one arrow covers every combination without a case analysis —
   * territory → territory marks nothing, territory → neutral starts a trail,
   * trail → neutral extends it, trail → own territory marks nothing, and stepping
   * onto your own trail adds nothing because a set holds no duplicates. Enemy
   * territory is *not* exempt: it is hostile ground, enterable and exposing (§7).
   *
   * **The closure seam lives on the `undefined` branch.** Landing on your own
   * territory while trailing is a closure (§7) and P05 does not implement one: the
   * trail stays open and nothing is claimed. That is deliberately visible rather
   * than approximated — a closure that claimed "the path only" would look like
   * §7's land bridge and be wrong in every case that encloses something (P05 D8).
   */
  const marked = (state: GameState, move: StepMove, mover: PlayerId): ArrowId | undefined =>
    state.territory.get(move.exit) === mover ? undefined : move.exit;

  const markStep = (state: GameState, move: StepMove, mover: PlayerId): GameState['trails'] => {
    const addition = marked(state, move, mover);
    const rebuilt = new Map<PlayerId, ReadonlySet<ArrowId>>();
    for (const [player, arrows] of state.trails) {
      rebuilt.set(
        player,
        canonical(player === mover && addition !== undefined ? [...arrows, addition] : [...arrows]),
      );
    }
    if (addition !== undefined && !rebuilt.has(mover)) {
      rebuilt.set(mover, canonical([addition]));
    }
    return rebuilt;
  };

  // ── branch anchors ─────────────────────────────────────────────────────────

  /**
   * The player's trail arrows meeting a point on one side — the **anchor pool** of a
   * branch there. Two or more of them is a branch (a join on the in side, a split on
   * the out side); one or none is ordinary trail.
   */
  const strandsInto = (
    point: PointId,
    trail: ReadonlySet<ArrowId>,
  ): readonly ArrowId[] => geometry.inArrows(point).filter((a) => trail.has(a));

  const strandsOutOf = (
    point: PointId,
    trail: ReadonlySet<ArrowId>,
  ): readonly ArrowId[] => geometry.outArrows(point).filter((a) => trail.has(a));

  /**
   * The mover's heads standing on a pool, with `debit` heads already taken off the
   * arrow the move is leaving.
   *
   * Only the mover's own heads count. An enemy stack sitting on your trail arrow is a
   * problem, not an anchor (§6.1) — the same reading `anchorGrade` takes.
   */
  const anchoring = (
    state: GameState,
    pool: readonly ArrowId[],
    mover: PlayerId,
    leaving: ArrowId,
    debit: number,
  ): number =>
    pool.reduce((heads, arrow) => {
      const group = state.groups.get(arrow);
      if (group === undefined || group.owner !== mover) return heads;
      return heads + group.heads - (arrow === leaving ? debit : 0);
    }, 0);

  /**
   * §5's branch mandate, read as P05 D6 settled it: **local to what the move
   * changes.**
   *
   * The move adds at most one arrow — its destination — and the mover's heads land
   * on it, so every branch the move *creates* is paid the moment it exists: a join
   * formed at the far point is anchored by the arrivals, and so is a split formed
   * at the point transited. The mandate therefore only ever bites on the other
   * half of D6 — **the anchor the move steps away from** — which is exactly why the
   * only test here is on the arrow being vacated.
   *
   * That arrow sits at two points, and is a strand of a branch at either:
   *
   * - as an **in-arrow** of the point it feeds, if the mover's trail has a second
   *   in-arrow there — a join, paid before;
   * - as an **out-arrow** of the point it leaves, if the mover's trail has a second
   *   out-arrow there — a split, paid after.
   *
   * **The toll is one head per branch, not one per strand** (SPEC §11 item 35). A
   * join needs one of the mover's heads somewhere among its in-arrows and a split one
   * among its out-arrows, so a fork costs one and a crossover two — §5's *one before,
   * one after* and §6.1's price list, both. *Which* strand carries it is not asked,
   * and cannot be: §5 charges "the out-arrow it departed onto" and the trail is a set
   * that records no pairing (§6.1a, §11 item 26), so the arm a splitting move created
   * is indistinguishable from the arm that was already there the moment it exists. A
   * sibling arm therefore holds the toll for the whole junction.
   *
   * Three things this deliberately is **not**:
   *
   * - **Not a standing invariant.** Only the two pools the vacated arrow belongs to
   *   are examined, so a branch damage already emptied is one no move is standing on,
   *   and every move elsewhere goes through. §5 and §6.1 both say that state is legal;
   *   a whole-trail check would freeze the board the first time a cut produced one.
   * - **Not a tax on ordinary trail.** A linear arrow is alone on both sides, so
   *   neither pool is a branch. §5 records an earlier draft that read the vacated
   *   arrow *unconditionally* and calls it fatal — a 2-stack could not move at all.
   *   The difference is the branch test, and it is the whole difference.
   * - **Not a wall.** One head is the price of branching and nothing more (§5): a
   *   front spends its kill on the first head and halts at the second, so a player who
   *   wants a junction to actually stop something leaves two, as anywhere else.
   */
  const unpaidBranch = (
    state: GameState,
    move: StepMove,
    mover: PlayerId,
  ): UnpaidBranch | undefined => {
    const trail = markStep(state, move, mover).get(mover) ?? NO_TRAIL;
    // Territory carries no anchor. An arrow the mover is not trailing on is not a
    // strand of theirs however dense the trail around it is (§5's safety rule).
    if (!trail.has(move.from)) return undefined;

    /**
     * Would this move take the branch's last head?
     *
     * Only the two pools `move.from` belongs to are ever asked, and **that locality is
     * what keeps the mandate from freezing the board** — not a before-and-after
     * comparison. A branch damage already emptied is a branch no move is standing on,
     * so no move's pools contain it and nothing refuses. (A `before` guard would be
     * dead code here: `move.from` is in the pool by construction and `moversFor` has
     * already established the mover's group stands on it, so the pool is never empty
     * of heads when it is asked.)
     */
    const stripped = (
      pool: readonly ArrowId[],
      kind: UnpaidBranch['kind'],
      point: PointId,
    ): UnpaidBranch | undefined => {
      if (pool.length < 2) return undefined;
      if (anchoring(state, pool, mover, move.from, move.count) > 0) return undefined;
      return { kind, point, anchor: move.from };
    };

    const ahead = geometry.target(move.from);
    const behind = geometry.origin(move.from);
    return (
      stripped(strandsInto(ahead, trail), 'join', ahead) ??
      stripped(strandsOutOf(behind, trail), 'split', behind)
    );
  };

  const requireBranchAnchors = (state: GameState, move: StepMove, mover: PlayerId): void => {
    const unpaid = unpaidBranch(state, move, mover);
    if (unpaid === undefined) return;
    reject(
      `point ${String(unpaid.point)} is a ${unpaid.kind} of ${String(mover)}'s trail, so a head must stay on ${String(unpaid.anchor)}`,
    );
  };

  // ── chords ─────────────────────────────────────────────────────────────────

  /**
   * The chord two arrows draw at a point, both endpoints asked of `slotOf`.
   *
   * Never inferred from an identifier: ids are opaque (P01 D1), and an engine that
   * parsed one would pass on the generated tiling and fail on a fixture — which is
   * the whole reason the port exposes `slotOf` rather than an opaque verdict (D9).
   */
  const chordAt = (point: PointId, into: ArrowId, out: ArrowId): Chord =>
    chord(geometry.slotOf(point, into), geometry.slotOf(point, out));

  /**
   * A player's trail chords at a point — **`i × o` of them**, one per (trail
   * in-arrow, trail out-arrow) pair (§2, §6.1a).
   *
   * No pairing is recovered because the set holds none (§11 item 26): the point
   * simply *is* a join followed by a split, every in feeding every out. Reading the
   * two sides off the port and filtering by the trail — rather than iterating the
   * trail — is what makes the order a fact about the board.
   */
  const trailChordsAt = (
    state: GameState,
    point: PointId,
    player: PlayerId,
  ): readonly Chord[] => {
    const trail = trailOf(state, player);
    const ins = geometry.inArrows(point).filter((a) => trail.has(a));
    const outs = geometry.outArrows(point).filter((a) => trail.has(a));
    return ins.flatMap((into) => outs.map((out) => chordAt(point, into, out)));
  };

  /**
   * The point a traversal transits, and the one chord it draws there.
   *
   * A traversal that does not follow the grain is not a traversal, and answering
   * `false` would hide the caller's bug rather than report it (P04 D9).
   */
  const transit = (traversal: Traversal): { point: PointId; drawn: Chord } => {
    const point = geometry.target(traversal.from);
    if (!geometry.outArrows(point).includes(traversal.exit)) {
      reject(
        `${String(traversal.exit)} is not an out-arrow of the point ${String(traversal.from)} transits — movement follows the grain`,
      );
    }
    return { point, drawn: chordAt(point, traversal.from, traversal.exit) };
  };

  /**
   * Every chord the trail presents, not only the first — the failure the crossings
   * suite exists to catch. An engine that tested one chord passes every spine and
   * quietly fails every knot.
   */
  const crosses = (
    state: GameState,
    traversal: Traversal,
    player: PlayerId,
    predicate: (ours: Chord, theirs: Chord) => boolean,
  ): boolean => {
    const { point, drawn } = transit(traversal);
    return trailChordsAt(state, point, player).some((theirs) => predicate(drawn, theirs));
  };

  // ── anchor grade ───────────────────────────────────────────────────────────

  /**
   * What holds a stretch of trail live (§6.1, P05 D7).
   *
   * Connectivity over the trail set is **undirected** — two trail arrows are one
   * stretch when they share a point, whichever way either points. §7's pincer says
   * outright that enclosure is a property of the curve and not of the flow along
   * it, and §6.1 re-attaches a fragment by laying a fresh path *to* it, against the
   * direction the fragment was laid; a grade computed along the grain refuses both.
   *
   * **What counts as reaching territory is the departure**, and that is directional
   * because §7 makes it so: a closure is *departing your own territory and landing
   * back on it*, so the anchor a trail rests on is the ground it left. §6.1 says the
   * same from the other side — a deep cut takes "the region touching the victim's
   * territory" and everything beyond it survives with "the territory anchor gone",
   * which is only a demotion if the anchor was the departure. So a stretch is
   * territory grade when some arrow of it leaves a point one of the player's own
   * territory arrows feeds, and re-attachment (§6.1) is the ordinary case of that:
   * lay a road from home to the fragment and the whole component is promoted.
   *
   * A trail that merely *runs into* territory it never left is **stack grade** —
   * §6.3 is explicit that a raider's trail does not earn a territory anchor however
   * well it is garrisoned, and stack grade is exactly "drivable home for a land
   * bridge, encloses nothing".
   *
   * The flood's visit order is not observable: both answers are existence questions
   * over a connected component, and a component does not depend on how it was walked.
   */
  const anchorGrade = (state: GameState, arrow: ArrowId, player: PlayerId): AnchorGrade => {
    const trail = trailOf(state, player);
    if (!trail.has(arrow)) {
      reject(
        `${String(arrow)} is not in ${String(player)}'s trail, so it has no anchor grade`,
      );
    }
    const reached = new Set<ArrowId>([arrow]);
    const pending: ArrowId[] = [arrow];
    let departsTerritory = false;
    let carriesOwnStack = false;

    for (let here = pending.pop(); here !== undefined; here = pending.pop()) {
      if (state.groups.get(here)?.owner === player) carriesOwnStack = true;
      const behind = geometry.origin(here);
      if (geometry.inArrows(behind).some((a) => state.territory.get(a) === player)) {
        departsTerritory = true;
      }
      for (const point of [behind, geometry.target(here)]) {
        for (const next of arrowsAt(point)) {
          if (reached.has(next) || !trail.has(next)) continue;
          reached.add(next);
          pending.push(next);
        }
      }
    }

    if (departsTerritory) return 'territory';
    return carriesOwnStack ? 'stack' : 'dormant';
  };

  return {
    markStep,
    unpaidBranch,
    requireBranchAnchors,
    trailChordsAt,
    /**
     * The **full** verdict — interleave or coincide — which §6.1's cut and §6.2's
     * combat both take. Landing directly on one of the enemy's arrows is as much a
     * crossing as threading between two of them (§2).
     */
    crossesTrail: (state, traversal, victim) => crosses(state, traversal, victim, chordsCross),
    /**
     * The **narrow** verdict — interleave only — which §7's even-odd takes.
     * Coincidence cannot invert anything: re-traversing an arrow already in the set
     * leaves the set unchanged (§6.1a), so there is nothing for fill to flip.
     */
    selfCrosses: (state, traversal, mover) => crosses(state, traversal, mover, chordsInterleave),
    anchorGrade,
  };
};
