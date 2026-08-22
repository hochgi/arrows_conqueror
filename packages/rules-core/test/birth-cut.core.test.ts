/**
 * docs/spec/birth-cut/birth-cut.core.feature — one test per scenario.
 *
 * @see docs/spec/birth-cut/birth-cut.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@conquarrow/contracts';
import type { ArrowId, GameState, VertexId } from '@conquarrow/contracts';
import { orderedBorders } from '../src/economy';
import {
  A,
  B,
  anArrow,
  anExitFrom,
  headsOn,
  isTrail,
  onBoard,
  owned,
  ownerOf,
  pathFrom,
  stateOf,
} from './support';

const aSpawnerOn = (
  geometry: ReturnType<typeof onBoard>['geometry'],
  arrow: ArrowId,
): { vertex: VertexId; borders: readonly ArrowId[] } => {
  const vertex = geometry.flankVertices(arrow)[0];
  if (vertex === undefined) throw new Error('setup: arrow has no flank vertex');
  return { vertex, borders: orderedBorders(geometry, vertex) };
};

const totalHeads = (state: GameState): number =>
  [...state.groups.values()].reduce((sum, group) => sum + group.heads, 0);

const fullRound = (rules: ReturnType<typeof onBoard>['rules'], state: GameState) =>
  rules.apply(rules.apply(state, endTurn()), endTurn());

const aBirthBoard = (table: ReturnType<typeof onBoard>) => {
  const seed = anArrow(table.geometry);
  const { vertex, borders } = aSpawnerOn(table.geometry, seed);
  const feed = borders[0];
  const bHome = borders[1];
  const aShare = borders[2];
  if (feed === undefined || bHome === undefined || aShare === undefined) {
    throw new Error('setup: vertex does not border three arrows');
  }
  return { vertex, feed, bHome, aShare };
};

describe('enemy birth on bare trail cuts', () => {
  it('evaporates the region when an enemy head spawns onto bare open trail', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const continuation = anExitFrom(table.geometry, feed);
    const before = stateOf([], A, {
      trail: { A: [feed, continuation] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(ownerOf(after, feed)).toBe(B);
    expect(headsOn(after, feed)).toBe(1);
    expect(isTrail(after, A, feed)).toBe(false);
    expect(isTrail(after, A, continuation)).toBe(false);
  });

  it('halts at a garrison further along the trail', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const garrison = pathFrom(table.geometry, feed, 2)[1];
    if (garrison === undefined) throw new Error('setup: no continuation');
    const before = stateOf([{ arrow: garrison, owner: A, heads: 1 }], A, {
      trail: { A: [feed, garrison] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(ownerOf(after, feed)).toBe(B);
    expect(headsOn(after, feed)).toBe(1);
    expect(isTrail(after, A, feed)).toBe(false);
    expect(isTrail(after, A, garrison)).toBe(true);
    expect(ownerOf(after, garrison)).toBe(A);
    expect(headsOn(after, garrison)).toBe(1);
  });

  it('evaporates both arms when the birth is on a fork stem', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const arms = table.geometry.outArrows(table.geometry.target(feed));
    const arm0 = arms[0];
    const arm1 = arms[1];
    if (arm0 === undefined || arm1 === undefined) {
      throw new Error('setup: point has fewer than two outs');
    }
    const before = stateOf([], A, {
      trail: { A: [feed, arm0, arm1] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(isTrail(after, A, feed)).toBe(false);
    expect(isTrail(after, A, arm0)).toBe(false);
    expect(isTrail(after, A, arm1)).toBe(false);
    expect(ownerOf(after, feed)).toBe(B);
  });

  it('leaves the newborn on the feed arrow and does not kill existing heads', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const garrison = pathFrom(table.geometry, feed, 2)[1];
    if (garrison === undefined) throw new Error('setup: no garrison arrow');
    const before = stateOf([{ arrow: garrison, owner: A, heads: 2 }], A, {
      trail: { A: [feed, garrison] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const headsBefore = totalHeads(before);

    const after = fullRound(table.rules, before);

    expect(ownerOf(after, feed)).toBe(B);
    expect(headsOn(after, feed)).toBe(1);
    expect(headsOn(after, garrison)).toBe(2);
    expect(totalHeads(after)).toBe(headsBefore + 1);
  });
});
