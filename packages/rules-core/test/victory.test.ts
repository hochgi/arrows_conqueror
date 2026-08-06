/**
 * P09 — elimination and domination.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@arrows/contracts';
import { makeTiling } from '@arrows/geometry-tiling';
import { orderedBorders } from '../src/economy';
import { makeRules } from '../src/index';
import { applyElimination, tickDomination } from '../src/victory';
import { A, B, anArrow, stateOf } from './support';

describe('elimination', () => {
  it('awards the win when the opponent has no heads', () => {
    const tip = anArrow(makeTiling());
    const emptyA = stateOf([{ arrow: tip, owner: B, heads: 2 }], A);
    expect(applyElimination(emptyA).winner).toBe(B);
  });
});

describe('domination', () => {
  it('increments the streak when one player owns every share for a full round', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const seed = anArrow(geometry);
    const vertex = geometry.flankVertices(seed)[0];
    if (vertex === undefined) throw new Error('setup: no flank');
    const borders = orderedBorders(geometry, vertex);
    const feed = borders[0];
    if (feed === undefined) throw new Error('setup: no border');
    const territory = borders.map((arrow) => ({ arrow, owner: A }));
    const before = stateOf(
      [
        { arrow: feed, owner: A, heads: 1 },
        { arrow: borders[1] ?? feed, owner: B, heads: 1 },
      ],
      B,
      {
        territory,
        spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
        dominationN: 2,
      },
    );

    const afterRound = rules.apply(before, endTurn());
    expect(afterRound.dominationHolder).toBe(A);
    expect(afterRound.dominationStreak).toBe(1);
    expect(afterRound.winner).toBeUndefined();

    const mid = rules.apply(afterRound, endTurn());
    const won = rules.apply(mid, endTurn());
    expect(won.dominationStreak).toBe(2);
    expect(won.winner).toBe(A);
  });

  it('resets the streak when shares are split', () => {
    const geometry = makeTiling();
    const seed = anArrow(geometry);
    const vertex = geometry.flankVertices(seed)[0];
    if (vertex === undefined) throw new Error('setup: no flank');
    const borders = orderedBorders(geometry, vertex);
    const a0 = borders[0];
    const a1 = borders[1];
    const a2 = borders[2];
    if (a0 === undefined || a1 === undefined || a2 === undefined) {
      throw new Error('setup: expected 3 borders');
    }
    const state = stateOf([], A, {
      territory: [
        { arrow: a0, owner: A },
        { arrow: a1, owner: A },
        { arrow: a2, owner: B },
      ],
      spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
      dominationStreak: 3,
      dominationHolder: A,
      dominationN: 5,
    });
    const after = tickDomination(state, geometry);
    expect(after.dominationStreak).toBe(0);
    expect(after.dominationHolder).toBeUndefined();
  });
});
