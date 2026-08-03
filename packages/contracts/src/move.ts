/**
 * What a player does.
 *
 * SPEC §4 (turn structure), §5 (sentries are counts), §11 items 19 and 21.
 *
 *   A move takes a portion of one arrow's heads one step along an out-arrow.
 *   A turn is an ordered list of moves, ended explicitly.
 *
 * Three variants and no others. Splitting, merging, forking and dropping a
 * sentry are all the same move with a different `count` — a fourth variant
 * would mean a mechanic had been invented rather than expressed.
 *
 * This module owns the SHAPE of a move. Legality — whether the exit is really
 * an out-arrow of the source's target point, whether the mover has allowance
 * left, whether a crossing is won — is P04 and later.
 *
 * SKELETON — phase 2.
 *
 * @see docs/spec/move/move.md
 */

import type { ArrowId } from './ids';

export interface StepMove {
  readonly kind: 'step';
  readonly from: ArrowId;
  readonly exit: ArrowId;
  readonly count: number;
}

export interface SkipMove {
  readonly kind: 'skip';
  readonly from: ArrowId;
}

export interface EndTurnMove {
  readonly kind: 'endTurn';
}

export type Move = StepMove | SkipMove | EndTurnMove;

/** Exactly three, and the suite asserts it. */
export const MOVE_KINDS = ['step', 'skip', 'endTurn'] as const;

/**
 * Construct a step.
 *
 * Throws {@link ContractViolation} on a count that is not a positive integer,
 * and on a step whose source and exit are the same arrow — a step goes
 * somewhere, and staying put is a skip, which is a different move.
 */
export const step = (_from: ArrowId, _exit: ArrowId, _count: number): StepMove => {
  throw new Error('not implemented: step');
};

export const skip = (_from: ArrowId): SkipMove => {
  throw new Error('not implemented: skip');
};

export const endTurn = (): EndTurnMove => {
  throw new Error('not implemented: endTurn');
};

/**
 * Can this move be satisfied by a source arrow holding `headsOnSource` heads?
 *
 * Separate from construction because it is the one well-formedness question
 * that needs to look at the board. Keeping it a pure function of a single
 * number keeps P01 free of any dependency on game state.
 */
export const isSatisfiableBy = (_move: Move, _headsOnSource: number): boolean => {
  throw new Error('not implemented: isSatisfiableBy');
};

/** Structural equality. Never object identity — replay comparison depends on it. */
export const movesEqual = (_a: Move, _b: Move): boolean => {
  throw new Error('not implemented: movesEqual');
};

/**
 * A turn is an ordered list, and the order is data.
 *
 * The per-step model was chosen precisely so that no within-turn resolution
 * order has to be invented (SPEC §11 item 19). Reinforcing a stack before
 * another commits to a crossing is a legal and intended play, so two turns with
 * the same moves in different orders are different turns.
 */
export type Turn = readonly Move[];

export const turnsEqual = (_a: Turn, _b: Turn): boolean => {
  throw new Error('not implemented: turnsEqual');
};

/**
 * A group's movement allowance for one turn: `speed(N) = 1 + floor(log2 N)`.
 *
 * SPEC §3. A whole number, and nothing carries between turns — the harmonic
 * curve this replaced needed exact rationals and a bank, and was unreadable at
 * the table because you could not tell how far a stack moved without knowing
 * what it saved last turn.
 *
 * Two properties phase 3 must not break:
 *   - `speed(N) <= N` for all N, so splitting never loses on throughput (§3).
 *   - `speed(2) === 2`, so a pair moves exactly as far as two loose heads. That
 *     makes the pair the natural atom, which is also §5's sentry floor.
 *
 * Integer arithmetic only. `Math.log2` is float arithmetic and rounds wrong at
 * exact powers of two on some inputs — a determinism bug of exactly the kind
 * ADR 0001 calls the realistic one, since it would pass unit tests and surface
 * as replay drift.
 */
export const speed = (_heads: number): number => {
  throw new Error('not implemented: speed');
};
