/**
 * The rules engine, behind a port.
 *
 * SPEC §3 (allowance), §4 (turn structure). P04 decisions D2, D6, D7, D9.
 *
 * `apply(state, move) -> state` is the whole engine, and it is **pure**: no
 * clock, no randomness, no I/O, no mutation of its input (AGENTS.md, ADR 0001).
 * That is a product property — replays are exact, an AI can search, a desync is
 * impossible — not a testing convenience.
 *
 * P04 landed the **movement slice** (D7) and P05 adds trails and crossings. There
 * is still no `resolveClosure` and no economy method, because a signature that
 * pretended to know how closure resolves would be a rule invented in type form.
 * Later packets grow this port rather than adding a second one.
 *
 * @see docs/spec/movement/movement.md
 * @see docs/spec/trails/trails.md
 * @see docs/spec/crossings/crossings.md
 */

import type { Chord } from './chord';
import type { GameState } from './game-state';
import type { ArrowId, PlayerId, PointId } from './ids';
import type { Move } from './move';

/**
 * What holds a stretch of trail live (SPEC §6.1), and the difference is
 * load-bearing.
 *
 * - `territory` — reaches the player's own closed ground. Fully live: it can close
 *   and claim what it encloses (§7), and heads on it are not encircled (§6.3).
 * - `stack` — reaches one of the player's own groups but not their territory. Live
 *   but lesser: drivable home for a **land bridge**, encloses nothing, and does not
 *   save a head from conversion. Without this distinction a parked stack would be a
 *   founding site, which §7 forbids outright.
 * - `dormant` — reaches neither. A headless wall: claims nothing, charges nothing,
 *   and a head walking onto it later puts it back to work (§6.1a).
 */
export type AnchorGrade = 'territory' | 'stack' | 'dormant';

/**
 * A path transiting a point: in by `from`, out by `exit`. It draws exactly one
 * chord there (SPEC §2).
 *
 * Separate from `StepMove` on purpose — a traversal is the *geometric* question
 * ("would this cross?"), asked with no player, no count and no legality attached.
 * A crossing is a decision made by choosing an exit, so it can be asked before
 * anything is committed.
 */
export interface Traversal {
  readonly from: ArrowId;
  readonly exit: ArrowId;
}

export interface RulesPort {
  /**
   * Every move the active player may make from this state.
   *
   * When no group of the active player has a whole step left, this returns
   * **only** `endTurn` (P04 D6, confirmed): exhaustion is a legality constraint,
   * not a hidden player advance inside `apply(step)`. The player — or a hot-seat
   * adapter — still sends the `endTurn`, so the move list a replay stores always
   * says how the turn ended.
   *
   * Order must be stable, and must not depend on the order the state's groups
   * happened to be built in. ADR 0001 names ordering, not randomness, as the
   * realistic determinism failure: an engine that iterates an insertion-ordered
   * map into an ordered answer passes every unit test and drifts in replay.
   */
  legalMoves(state: GameState): readonly Move[];

  /**
   * Resolve one move into the next state.
   *
   * @throws ContractViolation if the move is illegal — the wrong player's stack,
   * an exit that is not an out-arrow of the source's target, more heads than the
   * source holds, no allowance left, an enemy-occupied destination, or an
   * identifier the board does not have (P04 D2, D9). An illegal move is never a
   * plausible no-op: a wrong step must not become a silent wrong board state.
   *
   * Stepping onto an enemy-occupied arrow is refused **here** because combat is
   * P06 (§6.2), not because heads destroy each other on contact.
   */
  apply(state: GameState, move: Move): GameState;

  /**
   * How many whole steps the group on `arrow` may take this turn: `speed(heads)`,
   * unless a merge override applies (§3, P04 D4). A group may step while
   * `spent < effectiveSpeed`.
   *
   * A derived query rather than a field, so the merge price cannot drift out of
   * step with the allowance check that reads it.
   *
   * @throws ContractViolation if no group stands on `arrow`, or the board does
   * not have it (P04 D9).
   */
  effectiveSpeed(state: GameState, arrow: ArrowId): number;

  /**
   * A player's trail chords at a point — **`i × o` of them**, one per (trail
   * in-arrow, trail out-arrow) pair (SPEC §2, §6.1a).
   *
   * A spine gives 1, a fork or join 2, a crossover 4, a triple crossover 9. Empty
   * when the trail has no in-arrow or no out-arrow there: the tip of a trail owns
   * the arrow it stands on but has not transited the point ahead of it.
   *
   * **No pairing is recovered because the set holds none.** A walk that went
   * `a→a, b→b` and one that went `a→b, b→a` leave the identical arrow set (§11
   * item 26), so a point with `i` ins and `o` outs simply *is* a join followed by a
   * split, every in feeding every out. Asserting a pairing would route damage down
   * arrows the player never connected.
   *
   * Order must be stable and independent of the order the trail set was built in.
   *
   * @throws ContractViolation if the board does not have `point`.
   */
  trailChordsAt(state: GameState, point: PointId, player: PlayerId): readonly Chord[];

  /**
   * Does this traversal cross `victim`'s trail at the point it transits?
   *
   * The **full** verdict — `chordsCross`, interleave **or** coincide — which is
   * what §6.1's cut and §6.2's combat take. Coincidence matters here: an enemy
   * cannot stand on your trail arrow without entering through its tail point, which
   * your trail also uses, so landing directly on one of their arrows is a crossing
   * (§2).
   *
   * A **query**. It refuses nothing, destroys nothing, and changes no state —
   * crossing is a decision the player commits to by choosing an exit, and what the
   * crossing costs is P06's.
   *
   * @throws ContractViolation if the board does not have the arrows, or `exit` is
   * not an out-arrow of `target(from)`.
   */
  crossesTrail(state: GameState, traversal: Traversal, victim: PlayerId): boolean;

  /**
   * Does this traversal cross `mover`'s **own** trail at the point it transits?
   *
   * The **narrow** verdict — `chordsInterleave` only — which is what §7's even-odd
   * takes. Coincidence cannot invert anything: re-traversing an arrow already in
   * the set leaves the set unchanged (§6.1a), so there is nothing for fill to flip.
   *
   * Deliberately a second method rather than `crossesTrail` with the mover as
   * victim. The predicate is shared and the question is not, and the two are one
   * `||` apart — which is exactly the kind of difference that gets lost inside a
   * flag.
   */
  selfCrosses(state: GameState, traversal: Traversal, mover: PlayerId): boolean;

  /**
   * What holds this arrow of `player`'s trail live (§6.1) — see
   * {@link AnchorGrade}.
   *
   * Reachability over the trail set, and **undirected**: §7's pincer says outright
   * that enclosure is a property of the curve and not of the flow along it, and
   * §6.1 re-attaches a fragment by laying a fresh path *to* it, against the
   * direction the fragment was laid. A grade computed along the grain refuses both.
   *
   * @throws ContractViolation if `arrow` is not in `player`'s trail — a grade is a
   * question about trail, and asking it of territory or bare ground is a caller
   * bug rather than a `dormant` answer.
   */
  anchorGrade(state: GameState, arrow: ArrowId, player: PlayerId): AnchorGrade;
}
