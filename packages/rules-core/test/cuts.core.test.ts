/**
 * docs/spec/cuts/cuts.core.feature — one test per scenario.
 *
 * Cuts are local: every scenario runs on a P02 fixture board. Trail and occupancy
 * are authored separately (P05), so a bare mid-trail cut and a garrisoned firebreak
 * are both sayable. No test names an adjacency it did not ask of `GeometryPort`.
 *
 * @see docs/spec/cuts/cuts.md
 */

import { describe, expect, it } from 'vitest';
import { step } from '@arrows/contracts';
import {
  A,
  B,
  MINIMAL_DIAMETER,
  anExitFrom,
  anInterleaving,
  arrowAt,
  chordOf,
  exitsByCrossing,
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

/** A point with its ins/outs, to build a trail shape at. */
const junction = (table: ReturnType<typeof onBoard>) =>
  slotsAt(table.geometry, table.geometry.target(
    pick(table.geometry.outArrows(table.geometry.seedPoint()), 0),
  ));

// ── Rule: a cut is an ordinary step that crosses an enemy trail ───────────────

describe('a cut is an ordinary step that crosses an enemy trail', () => {
  it('evaporates the region when crossing a spine mid-trail', () => {
    // "Crossing a spine mid-trail evaporates the region". No heads on the run
    // except possibly at its ends — one cut takes the lot between boundaries.
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    // Root the spine at B territory so the backward wall is defined; the cut still
    // destroys the trail arrows of the region (not the territory itself).
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
      territory: [{ arrow: trailIn, owner: B }],
    });
    expect(table.rules.crossesTrail(before, via(ourIn, ourExit), B)).toBe(true);

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(isTrail(after, B, trailOut)).toBe(false);
    expect(trailOf(after, A)).toContain(String(ourExit));
    expect(territoryOf(after, trailIn)).toBe(B);
  });

  it('cuts by coincidence when landing on a trail arrow', () => {
    // "Landing on a trail arrow is a cut by coincidence". §2: coinciding with a
    // trail arrow is a crossing.
    const table = onBoard();
    const { ins, outs } = junction(table);
    const theirIn = pick(ins, 0);
    const theirOut = pick(outs, 0);
    const ourIn = pick(ins, 1);
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [theirIn, theirOut] },
    });
    expect(table.rules.crossesTrail(before, via(ourIn, theirOut), B)).toBe(true);

    const after = table.rules.apply(before, step(ourIn, theirOut, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
  });

  it('does not cut when turning aside', () => {
    // "Turning aside is not a cut". Shadowing survives. Paired with a crossing
    // exit from the same setup so this cannot pass merely because nothing cuts yet.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const theirIn = pick(ins, 0);
    const theirOut = pick(outs, 0);
    const ourIn = pick(ins, 1);
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [theirIn, theirOut] },
    });
    const theirs = chordOf(table.geometry, via(theirIn, theirOut));
    const { aside, interleaving, coincidingOnly } = exitsByCrossing(
      table.geometry,
      point,
      ourIn,
      theirs,
    );
    if (aside.length === 0) throw new Error('setup: this point offers no aside exit');
    const crossing = [...interleaving, ...coincidingOnly][0];
    if (crossing === undefined) throw new Error('setup: this point offers no crossing exit');

    const afterAside = table.rules.apply(before, step(ourIn, pick(aside, 0), 1));
    expect(trailOf(afterAside, B)).toEqual(trailOf(before, B));

    const afterCross = table.rules.apply(before, step(ourIn, crossing, 1));
    expect(trailOf(afterCross, B).length).toBeLessThan(trailOf(before, B).length);
  });

  it('does not evaporate the cutter’s own trail', () => {
    // "A cut does not evaporate the cutter's own trail". Exposure is laying trail,
    // not a reflexive cut. Asserts the victim *was* cut, so this cannot pass on a
    // no-op evaporate.
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const before = stateOf([{ arrow: ourIn, owner: A, heads: 1 }], A, {
      trail: { A: [ourIn], B: [trailIn, trailOut] },
    });
    const cutterBefore = trailOf(before, A);

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(trailOf(after, B).length).toBeLessThan(trailOf(before, B).length);
    for (const arrow of cutterBefore) {
      expect(trailOf(after, A)).toContain(arrow);
    }
    expect(trailOf(after, A)).toContain(String(ourExit));
  });
});

// ── Rule: one kill per front — lone bleeds, pair is a firebreak ───────────────

describe('one kill per front — a lone head bleeds, a pair is a firebreak', () => {
  it('bleeds a lone sentry and continues the front', () => {
    // §6.1 / item 24: the first head spends the kill; it does not halt the front.
    const table = onBoard();
    const { trailIn, trailOut, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    // Extend beyond trailOut so there is a region past the lone sentry.
    const beyond = anExitFrom(table.geometry, trailOut);
    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: trailOut, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, trailOut, beyond] },
        territory: [{ arrow: trailIn, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(headsOn(after, trailOut)).toBe(0);
    expect(isTrail(after, B, beyond)).toBe(false);
  });

  it('halts a front at a pair of heads', () => {
    // The second head is the firebreak. Trail beyond f2 is not destroyed.
    // Built from anInterleaving so the cut is a real crossing on this board
    // (slot rotation is free — §11 item 29 — and a hand-picked spine may offer none).
    const table = onBoard();
    const { trailIn, trailOut: f1, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const f2 = anExitFrom(table.geometry, f1);
    const beyond = anExitFrom(table.geometry, f2);
    const home = pick(table.geometry.inArrows(table.geometry.origin(trailIn)), 0);

    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: f1, owner: B, heads: 1 },
        { arrow: f2, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, f1, f2, beyond] },
        territory: [{ arrow: home, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(headsOn(after, f1)).toBe(0);
    expect(headsOn(after, f2)).toBeGreaterThanOrEqual(1);
    expect(isTrail(after, B, beyond)).toBe(true);
  });

  it('rolls on when a second cut reaches the surviving firebreak', () => {
    // After a prior cut left one head on f2, a later front with a fresh kill
    // destroys it and continues into the region beyond.
    const table = onBoard();
    const run = pathFrom(table.geometry, anExitFrom(table.geometry,
      pick(table.geometry.inArrows(table.geometry.seedPoint()), 0)), 4);
    const f2 = arrowAt(run, 2);
    const beyond = arrowAt(run, 3);
    const cutPoint = table.geometry.target(arrowAt(run, 1));
    const { ins, outs } = slotsAt(table.geometry, cutPoint);
    const trailIn = arrowAt(run, 1);
    const trailOut = f2;
    if (!ins.includes(trailIn) || !outs.includes(trailOut)) {
      throw new Error('setup: run is not a spine through the firebreak point');
    }
    const theirChord = chordOf(table.geometry, via(trailIn, trailOut));
    const cutterIn = ins.find((a) => a !== trailIn);
    if (cutterIn === undefined) throw new Error('setup: no second in-arrow');
    const { interleaving } = exitsByCrossing(table.geometry, cutPoint, cutterIn, theirChord);
    if (interleaving.length === 0) throw new Error('setup: no interleaving exit');
    const cutExit = pick(interleaving, 0);

    const before = stateOf(
      [
        { arrow: cutterIn, owner: A, heads: 1 },
        { arrow: f2, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [cutterIn], B: [trailIn, f2, beyond] },
      },
    );

    const after = table.rules.apply(before, step(cutterIn, cutExit, 1));

    expect(headsOn(after, f2)).toBe(0);
    expect(isTrail(after, B, beyond)).toBe(false);
  });
});

// ── Rule: all-to-all — a front per branch ─────────────────────────────────────

describe('all-to-all — a front per branch', () => {
  it('floods both arms when a cut’s forward front reaches a fork', () => {
    // §6.1a / item 26: every out is fed; each branch carries the parent's kill.
    const table = onBoard();
    const { ins, outs } = junction(table);
    const trailIn = pick(ins, 0);
    const armX = pick(outs, 0);
    const armY = pick(outs, 1);
    const cutterIn = pick(ins, 1);
    // Coincidence onto armX cuts at the fork; forward fronts flood both outs.
    const before = stateOf([{ arrow: cutterIn, owner: A, heads: 1 }], A, {
      trail: { A: [cutterIn], B: [trailIn, armX, armY] },
      territory: [{ arrow: trailIn, owner: B }],
    });
    expect(table.rules.crossesTrail(before, via(cutterIn, armX), B)).toBe(true);

    const after = table.rules.apply(before, step(cutterIn, armX, 1));

    expect(isTrail(after, B, armX)).toBe(false);
    expect(isTrail(after, B, armY)).toBe(false);
  });

  it('spreads a backward front into every trail in-arrow at a join', () => {
    const table = onBoard();
    const { ins, outs } = junction(table);
    const inA = pick(ins, 0);
    const inB = pick(ins, 1);
    const trailOut = pick(outs, 0);
    const cutterIn = pick(ins, 2);
    const before = stateOf([{ arrow: cutterIn, owner: A, heads: 1 }], A, {
      trail: { A: [cutterIn], B: [inA, inB, trailOut] },
    });
    // Coincidence onto the trail out-arrow cuts at the join.
    expect(table.rules.crossesTrail(before, via(cutterIn, trailOut), B)).toBe(true);

    const after = table.rules.apply(before, step(cutterIn, trailOut, 1));

    expect(isTrail(after, B, inA)).toBe(false);
    expect(isTrail(after, B, inB)).toBe(false);
  });
});

// ── Rule: territory is a wall; survivors demote ───────────────────────────────

describe('territory is a wall; survivors demote', () => {
  it('stops backward evaporation at the victim’s territory', () => {
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

    expect(territoryOf(after, trailIn)).toBe(B);
    // Territory arrow is not removed from territory; trail may lose non-territory.
    expect(isTrail(after, B, trailOut)).toBe(false);
  });

  it('demotes the far fragment to stack grade after a deep cut', () => {
    // §6.1 / item 28. Conversion of heads on it is P07 — they keep standing here.
    // anInterleaving guarantees a crossing; the firebreak pair bounds the far tip.
    const table = onBoard();
    const { trailIn, trailOut: f1, ourIn, ourExit } = anInterleaving(
      table.geometry,
      MINIMAL_DIAMETER,
    );
    const f2 = anExitFrom(table.geometry, f1);
    const tip = anExitFrom(table.geometry, f2);
    const home = pick(table.geometry.inArrows(table.geometry.origin(trailIn)), 0);

    const before = stateOf(
      [
        { arrow: ourIn, owner: A, heads: 1 },
        { arrow: f1, owner: B, heads: 1 },
        { arrow: f2, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [ourIn], B: [trailIn, f1, f2, tip] },
        territory: [{ arrow: home, owner: B }],
      },
    );

    const after = table.rules.apply(before, step(ourIn, ourExit, 1));

    expect(isTrail(after, B, tip)).toBe(true);
    expect(table.rules.anchorGrade(after, tip, B)).toBe('stack');
  });
});
