/**
 * EARS invariants from docs/spec/birth-cut/birth-cut.md.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@conquarrow/contracts';
import type { ArrowId, GameState, VertexId } from '@conquarrow/contracts';
import { replay, replayIsDeterministic } from '../src/replay';
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
  snapshot,
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

describe('birth-cut invariants', () => {
  it('never reduces heads when a birth-cut resolves', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    const bHome = borders[1];
    const aShare = borders[2];
    if (feed === undefined || bHome === undefined || aShare === undefined) {
      throw new Error('setup: vertex does not border three arrows');
    }
    const continuation = anExitFrom(table.geometry, feed);
    const before = stateOf([], A, {
      trail: { A: [feed, continuation] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const headsBefore = totalHeads(before);

    const after = table.rules.apply(table.rules.apply(before, endTurn()), endTurn());

    expect(totalHeads(after)).toBe(headsBefore + 1);
    expect(headsOn(after, feed)).toBe(1);
  });

  it('replays a birth-cut round to the same snapshot', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    const bHome = borders[1];
    const aShare = borders[2];
    if (feed === undefined || bHome === undefined || aShare === undefined) {
      throw new Error('setup: vertex does not border three arrows');
    }
    const continuation = anExitFrom(table.geometry, feed);
    const initial = stateOf([], A, {
      trail: { A: [feed, continuation] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const moves = [endTurn(), endTurn()] as const;

    const final = replay(table.rules, initial, [...moves]);
    expect(ownerOf(final, feed)).toBe(B);
    expect(isTrail(final, A, feed)).toBe(false);
    expect(snapshot(replay(table.rules, initial, [...moves]))).toEqual(snapshot(final));
    expect(replayIsDeterministic(table.rules, initial, [...moves], snapshot)).toBe(true);
  });
});
