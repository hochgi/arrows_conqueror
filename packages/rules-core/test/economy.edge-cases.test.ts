/**
 * docs/spec/economy/economy.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/economy/economy.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational, step } from '@conquarrow/contracts';
import type { ArrowId, VertexId } from '@conquarrow/contracts';
import { orderedBorders } from '../src/economy';
import {
  A,
  B,
  aRunFromHome,
  anArrow,
  anExitFrom,
  arrowAt,
  headsOn,
  onBoard,
  onTiling,
  owned,
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

const fullRound = (rules: ReturnType<typeof onBoard>['rules'], state: ReturnType<typeof stateOf>) =>
  rules.apply(rules.apply(state, endTurn()), endTurn());

describe('reset on capture', () => {
  it('clears an accumulator when a closure claims the arrow', () => {
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const before = stateOf([{ arrow: last, owner: A, heads: 1 }], A, {
      trail: { A: [...run] },
      territory: owned([home, landing], A),
      accumulators: [[occupied, rational(5, 6)]],
    });

    const after = table.rules.apply(before, step(last, landing, 1));

    expect(after.accumulators.has(occupied)).toBe(false);
  });
});

describe('double-fed arrows', () => {
  it('adds both forces when two spawners land on the same owned arrow', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const flanks = table.geometry.flankVertices(seed);
    const v0 = flanks[0];
    const v1 = flanks[1];
    if (v0 === undefined || v1 === undefined) throw new Error('setup: need two flanks');
    const b0 = orderedBorders(table.geometry, v0);
    const b1 = orderedBorders(table.geometry, v1);
    // Align phases so both RR cursors point at `seed` this tick.
    const p0 = b0.indexOf(seed);
    const p1 = b1.indexOf(seed);
    if (p0 < 0 || p1 < 0) throw new Error('setup: seed not on both borders');

    const bLand = b0.find((arrow) => arrow !== seed);
    if (bLand === undefined) throw new Error('setup: v0 borders one arrow only');

    const before = stateOf([], A, {
      // B holds a share of v0, so the boundary does not vanish B and win the match
      // for A — a won match refuses the rest of the round (P38). Both cursors point
      // at `seed`, so B's share accrues nothing here.
      territory: [...owned([seed], A), ...owned([bLand], B)],
      spawners: [
        [v0, { force: rational(1, 9), phase: p0 }],
        [v1, { force: rational(1, 12), phase: p1 }],
      ],
    });

    const after = fullRound(table.rules, before);

    expect(after.accumulators.get(seed)).toEqual(rational(7, 36));
  });
});

describe('unowned feed', () => {
  it('accrues nothing on an unowned feed arrow', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    if (feed === undefined) throw new Error("setup: empty borders");
    const before = stateOf([], A, {
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });

    const after = fullRound(table.rules, before);

    expect(after.accumulators.has(feed)).toBe(false);
    expect(headsOn(after, feed)).toBe(0);
    expect(after.spawners.get(vertex)?.phase).toBe(1);
  });
});

describe('purity', () => {
  it('does not mutate the input state on accruing endTurn', () => {
    const table = onBoard();
    const seed = anArrow(table.geometry);
    const { vertex, borders } = aSpawnerOn(table.geometry, seed);
    const feed = borders[0];
    if (feed === undefined) throw new Error("setup: empty borders");
    // Start as B so one endTurn completes the round back to A.
    const s0 = stateOf([], B, {
      territory: owned([feed], A),
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
    });
    const before = snapshot(s0);

    const s1 = table.rules.apply(s0, endTurn());

    expect(snapshot(s0)).toEqual(before);
    expect(s1.accumulators.get(feed)).toEqual(rational(1, 3));
  });
});
