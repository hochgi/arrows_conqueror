/**
 * P09 — elimination and starvation.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@arrows/contracts';
import { makeTiling } from '@arrows/geometry-tiling';
import { orderedBorders } from '../src/economy';
import { makeRules } from '../src/index';
import { applyElimination, shareCountOf, tickDomination } from '../src/victory';
import { A, B, anArrow, stateOf } from './support';

describe('elimination', () => {
  it('awards the win when the opponent has no heads', () => {
    const tip = anArrow(makeTiling());
    const emptyA = stateOf([{ arrow: tip, owner: B, heads: 2 }], A);
    expect(applyElimination(emptyA).winner).toBe(B);
  });
});

describe('starvation', () => {
  it('increments the streak when one living player owns no shares for a full round', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const seed = anArrow(geometry);
    const vertex = geometry.flankVertices(seed)[0];
    if (vertex === undefined) throw new Error('setup: no flank');
    const borders = orderedBorders(geometry, vertex);
    const feed = borders[0];
    const other = borders[1];
    if (feed === undefined || other === undefined) throw new Error('setup: no border');
    // A owns every share; B is destitute.
    const territory = borders.map((arrow) => ({ arrow, owner: A }));
    const before = stateOf(
      [
        { arrow: feed, owner: A, heads: 1 },
        { arrow: other, owner: B, heads: 1 },
      ],
      B,
      {
        territory,
        spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
        dominationN: 2,
      },
    );
    expect(shareCountOf(before, B, geometry)).toBe(0);
    expect(shareCountOf(before, A, geometry)).toBe(3);

    const afterRound = rules.apply(before, endTurn());
    expect(afterRound.dominationHolder).toBe(B);
    expect(afterRound.dominationStreak).toBe(1);
    expect(afterRound.winner).toBeUndefined();

    const mid = rules.apply(afterRound, endTurn());
    const won = rules.apply(mid, endTurn());
    expect(won.dominationStreak).toBe(2);
    expect(won.dominationHolder).toBe(B);
    expect(won.winner).toBe(A);
  });

  it('resets the streak when the destitute player reacquires a share', () => {
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
    const state = stateOf(
      [
        { arrow: a0, owner: A, heads: 1 },
        { arrow: a1, owner: B, heads: 1 },
      ],
      A,
      {
        territory: [
          { arrow: a0, owner: A },
          { arrow: a1, owner: A },
          { arrow: a2, owner: B },
        ],
        spawners: [[vertex, { force: rational(1, 3), phase: 0 }]],
        dominationStreak: 3,
        dominationHolder: B,
        dominationN: 5,
      },
    );
    const after = tickDomination(state, geometry);
    expect(after.dominationStreak).toBe(0);
    expect(after.dominationHolder).toBeUndefined();
  });
});
