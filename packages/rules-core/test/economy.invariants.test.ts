/**
 * EARS invariants for docs/spec/economy/economy.md.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@conquarrow/contracts';
import type { ArrowId, VertexId } from '@conquarrow/contracts';
import { orderedBorders } from '../src/economy';
import { A, B, anArrow, headsOn, onBoard, owned, snapshot, stateOf } from './support';

const aSpawnerOn = (
  geometry: ReturnType<typeof onBoard>['geometry'],
  arrow: ArrowId,
): { vertex: VertexId; borders: readonly ArrowId[] } => {
  const vertex = geometry.flankVertices(arrow)[0];
  if (vertex === undefined) throw new Error('setup: arrow has no flank vertex');
  return { vertex, borders: orderedBorders(geometry, vertex) };
};

describe('economy invariants', () => {
  it('ticks only on full round; uses exact rationals; is pure', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    if (feed === undefined) throw new Error("setup: empty borders");
    const s0 = stateOf([], A, {
      territory: owned([feed], A),
      spawners: [[vertex, { force: rational(1, 12), phase: 0 }]],
    });

    const mid = table.rules.apply(s0, endTurn());
    expect(mid.accumulators.size).toBe(0);

    const done = table.rules.apply(mid, endTurn());
    expect(done.accumulators.get(feed)).toEqual(rational(1, 12));
    expect(snapshot(table.rules.apply(mid, endTurn()))).toEqual(snapshot(done));
  });

  it('does not set merge override on spawn into a friendly stack', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    if (feed === undefined) throw new Error("setup: empty borders");
    const before = stateOf([{ arrow: feed, owner: A, heads: 1 }], B, {
      territory: owned([feed], A),
      accumulators: [[feed, rational(11, 12)]],
      spawners: [[vertex, { force: rational(1, 12), phase: 0 }]],
    });

    const after = table.rules.apply(before, endTurn());
    expect(headsOn(after, feed)).toBe(2);
    expect(after.groups.get(feed)?.speedOverride).toBeUndefined();
  });
});
