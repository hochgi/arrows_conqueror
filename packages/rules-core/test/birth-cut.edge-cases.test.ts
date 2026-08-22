/**
 * docs/spec/birth-cut/birth-cut.edge-cases.feature — one test per scenario.
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
  snapshot,
  stateOf,
  trailOf,
} from './support';

const aSpawnerOn = (
  geometry: ReturnType<typeof onBoard>['geometry'],
  arrow: ArrowId,
): { vertex: VertexId; borders: readonly ArrowId[] } => {
  const vertex = geometry.flankVertices(arrow)[0];
  if (vertex === undefined) throw new Error('setup: arrow has no flank vertex');
  return { vertex, borders: orderedBorders(geometry, vertex) };
};

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
  return { vertex, feed, bHome, aShare, borders };
};

describe('blockade still prevents the birth', () => {
  it('does not spawn or cut when the trail owner occupies the feed arrow', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const before = stateOf([{ arrow: feed, owner: A, heads: 1 }], A, {
      trail: { A: [feed] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(headsOn(after, feed)).toBe(1);
    expect(ownerOf(after, feed)).toBe(A);
    expect(isTrail(after, A, feed)).toBe(true);
    expect(after.accumulators.get(feed)).toEqual(rational(2, 3));
  });
});

describe('friendly and unowned births are not cuts', () => {
  it('merges a birth onto the owner’s own trail without cutting', () => {
    const table = onBoard();
    const { vertex, feed, bHome } = aBirthBoard(table);
    const continuation = anExitFrom(table.geometry, feed);
    const before = stateOf([], A, {
      trail: { A: [feed, continuation] },
      territory: [...owned([feed], A), ...owned([bHome], B)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(ownerOf(after, feed)).toBe(A);
    expect(headsOn(after, feed)).toBe(1);
    expect(isTrail(after, A, feed)).toBe(true);
    expect(isTrail(after, A, continuation)).toBe(true);
  });

  it('neither spawns nor cuts on an unowned feed arrow', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const before = stateOf([], A, {
      trail: { A: [feed] },
      territory: [...owned([aShare], A), ...owned([bHome], B)],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(headsOn(after, feed)).toBe(0);
    expect(isTrail(after, A, feed)).toBe(true);
    expect(after.accumulators.has(feed)).toBe(false);
  });

  it('does not strip anyone when the birth arrow is not on a foreign trail', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const elsewhere = anExitFrom(table.geometry, bHome);
    const before = stateOf([], A, {
      trail: { A: [elsewhere] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const aTrail = trailOf(before, A);

    const after = fullRound(table.rules, before);

    expect(ownerOf(after, feed)).toBe(B);
    expect(headsOn(after, feed)).toBe(1);
    expect(trailOf(after, A)).toEqual(aTrail);
  });
});

describe('distal beyond a firebreak and double-feed', () => {
  it('leaves trail beyond a firebreak', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const path = pathFrom(table.geometry, feed, 3);
    const garrison = path[1];
    const distal = path[2];
    if (garrison === undefined || distal === undefined) {
      throw new Error('setup: need garrison and distal');
    }
    const before = stateOf([{ arrow: garrison, owner: A, heads: 1 }], A, {
      trail: { A: [feed, garrison, distal] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(isTrail(after, A, feed)).toBe(false);
    expect(isTrail(after, A, garrison)).toBe(true);
    expect(isTrail(after, A, distal)).toBe(true);
  });

  it('cuts once when two spawners emit on the same arrow in one tick', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const flanks = table.geometry.flankVertices(seed);
    const v0 = flanks[0];
    const v1 = flanks[1];
    if (v0 === undefined || v1 === undefined) throw new Error('setup: need two flanks');
    const b0 = orderedBorders(table.geometry, v0);
    const b1 = orderedBorders(table.geometry, v1);
    const p0 = b0.indexOf(seed);
    const p1 = b1.indexOf(seed);
    if (p0 < 0 || p1 < 0) throw new Error('setup: seed not on both borders');
    const bLand = b0.find((arrow) => arrow !== seed);
    const aShare = b0.find((arrow) => arrow !== seed && arrow !== bLand);
    if (bLand === undefined || aShare === undefined) {
      throw new Error('setup: v0 needs three borders');
    }
    const continuation = anExitFrom(table.geometry, seed);
    const before = stateOf([], A, {
      trail: { A: [seed, continuation] },
      territory: [...owned([seed], B), ...owned([bLand], B), ...owned([aShare], A)],
      accumulators: [[seed, rational(2, 3)]],
      spawners: [
        [v0, { force: rational(1, 3), phase: p0 }],
        [v1, { force: rational(1, 3), phase: p1 }],
      ],
    });

    const after = fullRound(table.rules, before);

    expect(isTrail(after, A, seed)).toBe(false);
    expect(ownerOf(after, seed)).toBe(B);
    expect(headsOn(after, seed)).toBeGreaterThanOrEqual(1);
  });
});

describe('purity', () => {
  it('does not mutate the input state on a birth-cut endTurn', () => {
    const table = onBoard();
    const { vertex, feed, bHome, aShare } = aBirthBoard(table);
    const continuation = anExitFrom(table.geometry, feed);
    const s0 = stateOf([], B, {
      trail: { A: [feed, continuation] },
      territory: [...owned([feed], B), ...owned([bHome], B), ...owned([aShare], A)],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const before = snapshot(s0);

    table.rules.apply(s0, endTurn());

    expect(snapshot(s0)).toEqual(before);
  });
});
