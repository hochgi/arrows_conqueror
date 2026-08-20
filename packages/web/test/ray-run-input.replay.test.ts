/**
 * P34 replay — a drafted route is an ordered move list, and replaying it lands
 * on an exact final state.
 *
 * Drafting is the only thing in the packet that touches turn flow, so this is
 * where accidental nondeterminism would show: the draft must be the *same* list
 * every time it is built from the same clicks, and the host applying it must
 * reproduce one occupancy exactly. The golden is written out by hand rather than
 * recorded from the implementation — a golden read back from the code under test
 * proves only that it is self-consistent.
 *
 * `replay(..., requireLegal)` also checks each drafted move is in `legalMoves` at
 * the moment it is played: a route the offer produced that the engine would not
 * have offered is not a route a player could have sent.
 */

import { describe, expect, it } from 'vitest';
import { step } from '@conquarrow/contracts';
import type { GameState, Move } from '@conquarrow/contracts';
import { replay, replayIsDeterministic } from '@conquarrow/rules-core';
import {
  arrowAlong,
  clickArrow,
  geometry,
  headsOn,
  openField,
  pendingOf,
  rules,
  selectRoute,
  sourceArrow,
} from './ray-run-input.support';

const board = { geometry, rules };
const from = sourceArrow(geometry);

/** Occupancy as a sorted, printable list — the shape a golden can be read in. */
const occupancy = (state: GameState): readonly string[] =>
  [...state.groups.entries()]
    .map(([arrow, group]) => `${String(arrow)} ${String(group.owner)}×${String(group.heads)}`)
    .toSorted();

describe('P34 replay — a drafted route applies as one ordered batch', () => {
  const first = arrowAlong(geometry, from, 0, 1);
  const second = arrowAlong(geometry, from, 0, 2);
  const third = arrowAlong(geometry, from, 0, 3);

  /**
   * Twelve heads: eight walk two steps, then four walk one more.
   *
   * **Revised by P35**: each count is set *after* the click that named its run,
   * not before. The emitted list is byte-identical to the one P34 asserted, which
   * is the point — the inversion changes when the question is asked, not what a
   * route may be. The P35 suite asserts the same golden from its own side
   * (`count-after-route.replay.test.ts`).
   */
  const draftTwoRunsWithASplit = () => {
    const state = openField(from, 12);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, second);
    selected.mode.setCarry(8);
    clickArrow(selected, third);
    selected.mode.setCarry(4);
    return { state, sent: pendingOf(selected.mode.send()) };
  };

  it('the sent moves are exactly the run the clicks named', () => {
    const { sent } = draftTwoRunsWithASplit();
    const expected: readonly Move[] = [
      step(from, first, 8),
      step(first, second, 8),
      step(second, third, 4),
    ];
    expect(sent).toEqual(expected);
  });

  it('replaying them reproduces one exact occupancy', () => {
    const { state, sent } = draftTwoRunsWithASplit();
    const final = replay(rules, state, sent);
    expect(occupancy(final)).toEqual([
      `${String(from)} A×4`,
      `${String(second)} A×4`,
      `${String(third)} A×4`,
    ]);
    // Heads are lives: twelve went out, twelve stand.
    expect(headsOn(final, from) + headsOn(final, second) + headsOn(final, third)).toBe(12);
    expect(final.groups.has(first)).toBe(false);
  });

  it('the same clicks draft the same list twice, and the replay does not drift', () => {
    const left = draftTwoRunsWithASplit();
    const right = draftTwoRunsWithASplit();
    expect(left.sent).toEqual(right.sent);
    expect(replayIsDeterministic(rules, left.state, left.sent, occupancy)).toBe(true);
    expect(occupancy(replay(rules, left.state, left.sent))).toEqual(
      occupancy(replay(rules, right.state, right.sent)),
    );
  });
});
