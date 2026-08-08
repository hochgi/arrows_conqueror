/**
 * P12 additions: wipe ⇒ evaporate, territory-root cut, stack-grade freeze.
 */

import { describe, expect, it } from 'vitest';
import { step } from '@arrows/contracts';
import {
  A,
  B,
  anExitFrom,
  anInterleaving,
  headsOn,
  isTrail,
  MINIMAL_DIAMETER,
  onBoard,
  pick,
  stateOf,
  trailOf,
} from './support';

describe('wipe starts evaporation (P12)', () => {
  it('evaporates defender trail from a wiped arrow', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn } = anInterleaving(table.geometry, MINIMAL_DIAMETER);
    const beyond = anExitFrom(table.geometry, trailOut);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 3 },
        { arrow: trailOut, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, trailOut, beyond] },
        territory: [{ arrow: trailIn, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, trailOut, 2));

    expect(headsOn(after, trailOut)).toBeGreaterThanOrEqual(0);
    expect(isTrail(after, B, beyond)).toBe(false);
  });
});

describe('stack-grade freeze (P12)', () => {
  it('offers no step that fully vacates a lone size-1 stack-grade tip', () => {
    const table = onBoard();
    const tip = pick(table.geometry.outArrows(table.geometry.seedPoint()), 0);
    const next = anExitFrom(table.geometry, tip);
    const before = stateOf([{ arrow: tip, owner: A, heads: 1, spent: 0 }], A, {
      trail: { A: [tip, next] },
    });
    expect(table.rules.anchorGrade(before, tip, A)).toBe('stack');

    const steps = table.rules.legalMoves(before).filter((m) => m.kind === 'step' && m.from === tip);
    expect(steps.length).toBe(0);
  });

  it('allows a size-2 stack-grade tip to leave one head behind', () => {
    const table = onBoard();
    const tip = pick(table.geometry.outArrows(table.geometry.seedPoint()), 0);
    const next = anExitFrom(table.geometry, tip);
    const before = stateOf([{ arrow: tip, owner: A, heads: 2, spent: 0 }], A, {
      trail: { A: [tip, next] },
    });
    expect(table.rules.anchorGrade(before, tip, A)).toBe('stack');

    const steps = table.rules
      .legalMoves(before)
      .filter((m) => m.kind === 'step' && m.from === tip);
    expect(steps.some((m) => m.kind === 'step' && m.count === 1)).toBe(true);
    expect(steps.every((m) => m.kind !== 'step' || m.count < 2)).toBe(true);
  });
});

describe('territory-root cut (P12)', () => {
  it('cuts when the last territory feeder into P0 is marked by the enemy', () => {
    const table = onBoard();
    const home = pick(table.geometry.inArrows(table.geometry.seedPoint()), 0);
    const p0 = table.geometry.target(home);
    const trail0 = pick(table.geometry.outArrows(p0), 0);
    const trail1 = anExitFrom(table.geometry, trail0);
    const territoryFeeders = [...table.geometry.inArrows(p0)];
    const lastFeeder = territoryFeeders.at(-1);
    if (lastFeeder === undefined) throw new Error('setup: P0 has no feeders');
    const otherFeeders = territoryFeeders.slice(0, -1);

    const approachArrow = table.geometry.window(p0, 3).arrows.find((a) =>
      table.geometry.outArrows(table.geometry.target(a)).includes(lastFeeder),
    );
    if (approachArrow === undefined) throw new Error('setup: no approach onto last feeder');

    const setup = stateOf(
      [
        { arrow: approachArrow, owner: A, heads: 2 },
        { arrow: trail1, owner: B, heads: 1 },
      ],
      A,
      {
        trail: {
          A: otherFeeders.filter((a) => a !== lastFeeder),
          B: [trail0, trail1],
        },
        territory: territoryFeeders.map((arrow) => ({ arrow, owner: B })),
      },
    );

    const after = table.rules.apply(setup, step(approachArrow, lastFeeder, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(setup, B).length);
  });
});
