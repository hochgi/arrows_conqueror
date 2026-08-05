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
 * P04 lands the **movement slice only** (D7). There is no `resolveClosure` and no
 * economy method here, because a signature that pretended to know how closure
 * resolves would be a rule invented in type form. Later packets grow this port
 * rather than adding a second one.
 *
 * @see docs/spec/movement/movement.md
 */

import type { GameState } from './game-state';
import type { ArrowId } from './ids';
import type { Move } from './move';

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
}
