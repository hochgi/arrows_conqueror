/**
 * Replay harness — fold an ordered move list over a pure `apply` (P10).
 *
 * A match is an initial state plus moves. Because the core is pure, replaying it
 * reproduces the final state exactly. Drift after a refactor means accidental
 * nondeterminism (ADR 0001), not a golden to re-record.
 *
 * By default every move must appear in `legalMoves` at the moment it is played —
 * a golden that leans on `apply` accepting something the offer list withholds is
 * not a game a player could have played.
 */

import { ContractViolation } from '@conquarrow/contracts';
import type { GameState, Move, RulesPort } from '@conquarrow/contracts';
import { movesEqual } from '@conquarrow/contracts';

export interface ReplayOptions {
  /**
   * When true (default), refuse any move not in `legalMoves(state)` before
   * applying it.
   */
  readonly requireLegal?: boolean;
}

const isOffered = (rules: RulesPort, state: GameState, move: Move): boolean =>
  rules.legalMoves(state).some((offered) => movesEqual(offered, move));

/**
 * Apply `moves` in order starting from `initial`. Pure: does not mutate inputs.
 */
export const replay = (
  rules: RulesPort,
  initial: GameState,
  moves: readonly Move[],
  options: ReplayOptions = {},
): GameState => {
  const requireLegal = options.requireLegal !== false;
  let state = initial;
  for (const move of moves) {
    if (requireLegal && !isOffered(rules, state, move)) {
      throw new ContractViolation(
        `replay move is not in legalMoves: ${JSON.stringify(move)}`,
      );
    }
    state = rules.apply(state, move);
  }
  return state;
};

/** Two independent replays of the same record must snapshot-equal. */
export const replayIsDeterministic = (
  rules: RulesPort,
  initial: GameState,
  moves: readonly Move[],
  snap: (state: GameState) => unknown,
): boolean => {
  const a = snap(replay(rules, initial, moves));
  const b = snap(replay(rules, initial, moves));
  return JSON.stringify(a) === JSON.stringify(b);
};
