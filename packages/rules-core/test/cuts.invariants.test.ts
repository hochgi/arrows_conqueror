/**
 * The EARS invariants of docs/spec/cuts/cuts.md, as properties.
 *
 * Enumerated deterministically over fixture boards — no generator, no seed.
 *
 * @see docs/spec/cuts/cuts.md — "Invariants"
 */

import { describe, expect, it } from 'vitest';
import { makeRules } from '../src/index';
import { step } from '@arrows/contracts';
import {
  A,
  B,
  MINIMAL,
  MINIMAL_DIAMETER,
  SPACIOUS,
  SPACIOUS_DIAMETER,
  anInterleaving,
  countingVertices,
  headsOn,
  isTrail,
  onBoard,
  pick,
  slotsAt,
  stateOf,
  territoryOf,
  trailOf,
  via,
} from './support';

const BOARDS = [
  { name: 'minimal', description: MINIMAL, diameter: MINIMAL_DIAMETER },
  { name: 'spacious', description: SPACIOUS, diameter: SPACIOUS_DIAMETER },
] as const;

describe('a crossing evaporates the victim’s trail in both directions', () => {
  it.each(BOARDS)('removes trail arrows of a bare spine on $name', ({ description, diameter }) => {
    const table = onBoard(description);
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(table.geometry, diameter);
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });
    expect(table.rules.crossesTrail(before, via(ourIn, ourExit), B)).toBe(true);

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
  });
});

describe('any garrison is a firebreak (P12)', () => {
  it('leaves the first occupied arrow standing with its heads', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const beyond = pick(table.geometry.outArrows(table.geometry.target(trailOut)), 0);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: trailOut, owner: B, heads: 1 },
        { arrow: beyond, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, trailOut, beyond] },
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(headsOn(after, trailOut)).toBe(1);
    expect(after.groups.get(beyond)?.heads).toBeGreaterThanOrEqual(1);
    expect(isTrail(after, B, beyond)).toBe(true);
  });
});

describe('all-to-all spreads a front into every continuation', () => {
  it('destroys every out-arm of a fork from one cut', () => {
    const table = onBoard();
    const { ins, outs } = slotsAt(
      table.geometry,
      table.geometry.target(pick(table.geometry.outArrows(table.geometry.seedPoint()), 0)),
    );
    const trailIn = pick(ins, 0);
    const armX = pick(outs, 0);
    const armY = pick(outs, 1);
    const cutterIn = pick(ins, 1);
    const before = stateOf([{ arrow: cutterIn, owner: A, heads: 1 }], A, {
      trail: { A: [cutterIn], B: [trailIn, armX, armY] },
    });

    const after = table.rules.apply(before, step(cutterIn, armX, 1));

    expect(isTrail(after, B, armX)).toBe(false);
    expect(isTrail(after, B, armY)).toBe(false);
  });
});

describe('halt is per arrow; territory is a wall; only the victim’s trail changes', () => {
  it('does not remove the victim’s territory arrow', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
      territory: [{ arrow: trailIn, owner: B }],
    });

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(isTrail(after, B, trailOut)).toBe(false);
    expect(territoryOf(after, trailIn)).toBe(B);
  });

  it('leaves every other player’s trail unchanged by the cut', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });
    const cutterTrail = trailOf(before, A);

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
    for (const arrow of cutterTrail) {
      expect(trailOf(after, A)).toContain(arrow);
    }
  });
});

describe('surviving fragments demote to stack grade', () => {
  it('reports stack grade on a far fragment after a deep cut', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const tip = pick(table.geometry.outArrows(table.geometry.target(trailOut)), 0);
    const home = pick(table.geometry.inArrows(table.geometry.origin(trailIn)), 0);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: trailOut, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, trailOut, tip] },
        territory: [{ arrow: home, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(isTrail(after, B, tip)).toBe(true);
    expect(table.rules.anchorGrade(after, tip, B)).toBe('stack');
  });
});

describe('cut resolution is pure and enumerates no vertex', () => {
  it('does not mutate the input trail sets', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const s0 = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });
    const before = trailOf(s0, B);

    const s1 = table.rules.apply(s0, step(ourIn, ourExit, 1));

    expect(trailOf(s0, B)).toEqual(before);
    expect(trailOf(s1, B).length).toBeLessThan(before.length);
  });

  it('enumerates no vertex on either fixture board', () => {
    for (const { description, diameter } of BOARDS) {
      const base = onBoard(description).geometry;
      const { geometry, vertexReads } = countingVertices(base);
      const rules = makeRules(geometry);
      const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(geometry, diameter);
      const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
        trail: { A: [ourIn], B: [trailIn, trailOut] },
      });
      const after = rules.apply(before, step(ourIn, ourExit, 1));
      expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
      expect(vertexReads()).toBe(0);
    }
  });
});
