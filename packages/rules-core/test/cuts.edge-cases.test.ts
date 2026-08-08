/**
 * docs/spec/cuts/cuts.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/cuts/cuts.md
 */

import { describe, expect, it } from 'vitest';
import { makeRules } from '../src/index';
import { step } from '@arrows/contracts';
import {
  A,
  B,
  MINIMAL_DIAMETER,
  anExitFrom,
  anInterleaving,
  arrowAt,
  countingVertices,
  headsOn,
  isTrail,
  onBoard,
  pathFrom,
  pick,
  slotsAt,
  stateOf,
  territoryOf,
  trailOf,
  via,
} from './support';

const junction = (table: ReturnType<typeof onBoard>) =>
  slotsAt(table.geometry, table.geometry.target(
    pick(table.geometry.outArrows(table.geometry.seedPoint()), 0),
  ));

// ── Rule: halt is per arrow, never per point ─────────────────────────────────

describe('halt is per arrow, never per point', () => {
  it('does not let a head on another arrow of the cut point shield against fire', () => {
    // §6.1 / item 27: combat and fire sit on different axes; point-wide shield withdrawn.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const trailIn = pick(ins, 0);
    const o1 = pick(outs, 0);
    const otherArrow = pick(ins, 1);
    const cutterIn = pick(ins, 2);
    const beyond = anExitFrom(table.geometry, o1);
    const before = stateOf(
      [
        { arrow: cutterIn, owner: A, heads: 1 },
        { arrow: otherArrow, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [cutterIn], B: [trailIn, o1, beyond] },
      },
    );
    expect(table.rules.crossesTrail(before, via(cutterIn, o1), B)).toBe(true);

    const after = table.rules.apply(before, step(cutterIn, o1, 1));

    // The head on the other arrow of P does not halt the front entering o1 —
    // beyond is destroyed, and that head is still standing.
    expect(headsOn(after, otherArrow)).toBe(1);
    expect(isTrail(after, B, beyond)).toBe(false);
    void point;
  });
});

// ── Rule: territory-anchored headless stretch is ordinary; dormant is not ────

describe('territory-anchored headless stretch is ordinary', () => {
  it('leaves a headless stretch on the territory side of a mid-trail cut', () => {
    // P12: tip garrison stops the front; trailOut may survive headless while
    // still territory-anchored via trailIn.
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const tip = anExitFrom(table.geometry, trailOut);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: tip, owner: B, heads: 2 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, trailOut, tip] },
        territory: [{ arrow: trailIn, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(headsOn(after, tip)).toBeGreaterThanOrEqual(1);
    expect(isTrail(after, B, tip)).toBe(true);
    // Forward halt at tip — trailOut may remain as headless territory-anchored wall.
    if (isTrail(after, B, trailOut)) {
      expect(after.groups.has(trailOut)).toBe(false);
    }
  });
});

// ── Rule: interactions ───────────────────────────────────────────────────────

describe('cut interactions', () => {
  it('destroys a trail mid-closure before it can claim', () => {
    // P05b's claim needs the trail; evaporation removes it.
    const table = onBoard();
    const home = pick(table.geometry.inArrows(table.geometry.seedPoint()), 0);
    const run = pathFrom(table.geometry, anExitFrom(table.geometry, home), 3);
    const n1 = arrowAt(run, 0);
    const n2 = arrowAt(run, 1);
    const closing = arrowAt(run, 2);
    // A is one step from landing home: standing on closing, about to step onto home.
    // B cuts A's trail at the point between n1 and n2 before that landing.
    const cutPoint = table.geometry.target(n1);
    const { ins, outs } = slotsAt(table.geometry, cutPoint);
    if (!ins.includes(n1) || !outs.includes(n2)) {
      throw new Error('setup: run is not a spine through the cut point');
    }
    const cutterIn = ins.find((a) => a !== n1);
    if (cutterIn === undefined) throw new Error('setup: no second in-arrow');

    const bHome = outs.find((o) => o !== n2);
    if (bHome === undefined) throw new Error('setup: no second out-arrow for B territory');
    const before = stateOf(
      [
        { arrow: closing, owner: A, heads: 1 },
        { arrow: cutterIn, owner: B, heads: 1 },
      ],
      B,
      {
        trail: { A: [n1, n2, closing] },
        territory: [
          { arrow: home, owner: A },
          { arrow: bHome, owner: B },
        ],
      },
    );
    // B lands on n2 by coincidence — a cut of A's trail.
    expect(table.rules.crossesTrail(before, via(cutterIn, n2), A)).toBe(true);

    const after = table.rules.apply(before, step(cutterIn, n2, 1));

    expect(isTrail(after, A, n1) || isTrail(after, A, n2)).toBe(false);
    // No new territory of A's from that path.
    for (const arrow of [n1, n2, closing]) {
      expect(territoryOf(after, arrow)).not.toBe(A);
    }
  });

  it('resolves combat before the cut when both apply on the same step', () => {
    // Trail is independent of heads (§6.1a). Order settled for P06. Stay-behind.
    const table = onBoard();
    const { ins, outs } = junction(table);
    const theirIn = pick(ins, 0);
    const e1 = pick(outs, 0);
    const ourIn = pick(ins, 1);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 2 },
        { arrow: e1, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [theirIn, e1] },
      },
    );
    expect(table.rules.crossesTrail(before, via(ourIn, e1), B)).toBe(true);

    const after = table.rules.apply(before, step(ourIn, e1, 1));

    // Combat first: 1v1 → attacker 1, defender 0, attacker lands; stay-behind.
    expect(headsOn(after, e1)).toBe(1);
    expect(after.groups.get(e1)?.owner).toBe(A);
    expect(headsOn(after, ourIn)).toBe(1);
    // Then cut: B's trail evaporates from the cut.
    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
  });
});

// ── Rule: purity and determinism ─────────────────────────────────────────────

describe('cut resolution is pure and deterministic', () => {
  it('does not mutate the input state', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const s0 = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });
    const trailsBefore = trailOf(s0, B);
    const groupsBefore = [...s0.groups.entries()].map(([a, g]) => [String(a), g.heads] as const);

    const s1 = table.rules.apply(s0, step(ourIn, ourExit, 1));

    expect(trailOf(s0, B)).toEqual(trailsBefore);
    expect(
      [...s0.groups.entries()].map(([a, g]) => [String(a), g.heads] as const),
    ).toEqual(groupsBefore);
    expect(trailOf(s1, B)).not.toEqual(trailsBefore);
  });

  it('yields equal ordered trail removals from equal inputs', () => {
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const marked = [trailIn, trailOut];
    const forwards = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: marked },
    });
    const backwards = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [...marked].reverse() },
    });
    const move = step(ourIn, ourExit, 1);

    const left = table.rules.apply(forwards, move);
    const right = table.rules.apply(backwards, move);
    expect(trailOf(left, B).length).toBeLessThan(trailOf(forwards, B).length);
    expect([...(right.trails.get(B) ?? [])].map(String)).toEqual(
      [...(left.trails.get(B) ?? [])].map(String),
    );
  });

  it('enumerates no vertex', () => {
    const base = onBoard().geometry;
    const { geometry, vertexReads } = countingVertices(base);
    const rules = makeRules(geometry);
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(geometry, MINIMAL_DIAMETER);
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });

    const after = rules.apply(before, step(ourIn, ourExit, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
    expect(vertexReads()).toBe(0);
  });
});
