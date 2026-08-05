/**
 * A replay fixture for the P04 turn loop.
 *
 * A match is an initial state plus an ordered list of moves, and because the core
 * is pure, replaying it must reproduce the final state exactly. One fixture
 * exercises far more rule surface per line than an example does, and it is the
 * only reliable detector of accidental nondeterminism: if this drifts after a
 * refactor, an ordering dependence was introduced — find it, do not re-record the
 * golden (rules-invariants; P10 lands the harness itself).
 *
 * The moves name arrows literally, because a recorded match is a *record*. Every
 * grain relationship it assumes is checked against `GeometryPort` first, so a
 * mistyped arrow fails as a setup error rather than as a rules failure.
 *
 * **The record follows `legalMoves`, not the wider `apply`.** `apply` accepts a
 * skip of a group with no whole step left — a skip spends nothing, so it has no
 * allowance to check — but `legalMoves` does not offer one, and a golden that
 * leaned on the difference would record a turn no player could have played. A
 * guard below asserts every recorded move was on offer when it was made
 * (movement.md, "legalMoves is the narrower half of the port").
 *
 * The turn it records: a pair advances and splits off a scout, while a garrison
 * elsewhere stands its ground (a skip). The opponent takes an ordinary single
 * step. Next turn the rearguard walks into the scout — an equal merge.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, skip, speed, step } from '@arrows/contracts';
import type { GameState, Move } from '@arrows/contracts';
import { MINIMAL, fixtureArrow } from '@arrows/geometry-fixtures';
import { A, B, headsOn, onBoard, ownerOf, snapshot, spentOn, stateOf, totalHeads } from './support';

const arrow = (from: string, to: string): ReturnType<typeof fixtureArrow> =>
  fixtureArrow(MINIMAL, from, to);

const A_PAIR = arrow('0', '1');
const A_ADVANCE = arrow('1', '2');
const A_SCOUT = arrow('2', '3');
const A_GARRISON = arrow('3', '4');
const B_HEAD = arrow('4', '5');
const B_ADVANCE = arrow('5', '6');

const INITIAL = (): GameState =>
  stateOf(
    [
      { arrow: A_PAIR, owner: A, heads: 2 },
      { arrow: A_GARRISON, owner: A, heads: 1 },
      { arrow: B_HEAD, owner: B, heads: 1 },
    ],
    A,
  );

const MOVES: readonly Move[] = [
  // Player A: the pair advances as one (speed 2), then sends one head on and
  // leaves the other standing — the remainder inherited spent 1 and is done.
  step(A_PAIR, A_ADVANCE, 2),
  step(A_ADVANCE, A_SCOUT, 1),
  // The garrison is untouched and still has its whole step, so declining to move
  // it is a choice the engine offered. Skipping the rearguard instead would not
  // have been: the split left it spent 1 of its speed 1.
  skip(A_GARRISON),
  endTurn(),
  // Player B: one step, one head.
  step(B_HEAD, B_ADVANCE, 1),
  endTurn(),
  // Player A: the rearguard walks into the scout. Equal arrival, so the merged
  // pair has speed 1 — spent 0, so it could still move; the player ends instead.
  step(A_ADVANCE, A_SCOUT, 1),
  endTurn(),
];

describe('a recorded turn loop replays to the same state', () => {
  it('assumes only grain relationships the board actually has', () => {
    // A setup guard, not a scenario: every step in the record must follow the
    // grain, or a typo in an arrow id would masquerade as a rules bug.
    const { geometry } = onBoard(MINIMAL);
    for (const move of MOVES) {
      if (move.kind !== 'step') continue;
      expect(geometry.outArrows(geometry.target(move.from))).toContain(move.exit);
    }
  });

  it('records only moves the engine offered at the time', () => {
    // The P10 alignment: a record is a list of choices, and every choice must have
    // been on the menu. Without this, a golden can quietly depend on `apply` being
    // more permissive than `legalMoves` — a skip of an exhausted group is the exact
    // case, and this record used to contain one.
    const table = onBoard(MINIMAL);
    let state = INITIAL();

    for (const move of MOVES) {
      expect(table.rules.legalMoves(state)).toContainEqual(move);
      state = table.rules.apply(state, move);
    }
  });

  it('reaches the recorded final state', () => {
    const table = onBoard(MINIMAL);
    let state = INITIAL();

    for (const move of MOVES) {
      const before = totalHeads(state);
      state = table.rules.apply(state, move);
      // No P04 move mints or kills a head, at any point in the record.
      expect(totalHeads(state)).toBe(before);
    }

    // Two turns of A and one of B: the four heads stand as a pair and two singles,
    // every counter is clear, and it is B to move.
    expect(state.activePlayer).toBe(B);
    expect(state.groups.size).toBe(3);
    expect(headsOn(state, A_SCOUT)).toBe(2);
    expect(ownerOf(state, A_SCOUT)).toBe(A);
    expect(spentOn(state, A_SCOUT)).toBe(0);
    // The skipped garrison is exactly where it was placed, having spent nothing.
    expect(headsOn(state, A_GARRISON)).toBe(1);
    expect(ownerOf(state, A_GARRISON)).toBe(A);
    expect(spentOn(state, A_GARRISON)).toBe(0);
    expect(headsOn(state, B_ADVANCE)).toBe(1);
    expect(ownerOf(state, B_ADVANCE)).toBe(B);
    expect(spentOn(state, B_ADVANCE)).toBe(0);
    // End-turn cleared the merge override the equal arrival had set.
    expect(table.rules.effectiveSpeed(state, A_SCOUT)).toBe(speed(2));
  });

  it('reproduces that state exactly on a second replay', () => {
    const table = onBoard(MINIMAL);
    const replay = (): GameState =>
      MOVES.reduce<GameState>((state, move) => table.rules.apply(state, move), INITIAL());

    expect(snapshot(replay())).toEqual(snapshot(replay()));
  });
});
