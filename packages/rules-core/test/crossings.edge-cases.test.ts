/**
 * docs/spec/crossings/crossings.edge-cases.feature — one test per scenario.
 *
 * Saturation, empty-side degeneracies, the exact difference between the two
 * predicates, and determinism. The last of those is the one that matters most in
 * practice: a chord list is an ordered answer derived from a `Set`, which is
 * precisely the shape ADR 0001 names as the realistic determinism failure.
 *
 * @see docs/spec/crossings/crossings.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, chordsCross, chordsInterleave, step } from '@conquarrow/contracts';
import {
  A,
  B,
  MINIMAL_DIAMETER,
  anArrow,
  anInterleaving,
  arrowAt,
  chordKeys,
  chordOf,
  onBoard,
  pathFrom,
  pick,
  slotsAt,
  stateOf,
  via,
} from './support';

const junction = (
  table: ReturnType<typeof onBoard>,
): ReturnType<typeof slotsAt> =>
  slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));

// ── Rule: a saturated point is impassable by arithmetic ──────────────────────

describe('a saturated point is impassable by arithmetic, not by rule', () => {
  it('leaves no free out-arrow at a triple crossover', () => {
    // §2: at a full crossover all six slots are the trail's, so no enemy can transit
    // the point at all. Nothing declares it impassable — the arithmetic leaves
    // nowhere to go.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const state = stateOf([], A, { trail: { A: [...ins, ...outs] } });

    const free = table.geometry
      .outArrows(point)
      .filter((exit) => state.trails.get(A)?.has(exit) !== true);

    expect(free).toEqual([]);
    expect(table.rules.trailChordsAt(state, point, A).length).toBe(9);
  });

  it('makes every enemy traversal of a saturated point a crossing', () => {
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const state = stateOf([], B, { trail: { A: [...ins, ...outs] } });

    for (const into of table.geometry.inArrows(point)) {
      for (const exit of table.geometry.outArrows(point)) {
        expect(table.rules.crossesTrail(state, via(into, exit), A)).toBe(true);
      }
    }
  });

  it('makes a crossover more cuttable than a spine, not less', () => {
    // The right sign, and the reason all-to-all was chosen over immunity (§11 item
    // 26): more strands through a point means more ways through it. Immunity would
    // have made a crossover a permanent free wall.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const spine = stateOf([], A, { trail: { A: [pick(ins, 0), pick(outs, 0)] } });
    const knot = stateOf([], A, {
      trail: { A: [pick(ins, 0), pick(ins, 1), pick(outs, 0), pick(outs, 1)] },
    });
    const enemyIn = pick(ins, 2);
    const crossingExits = (state: typeof spine): number =>
      table.geometry
        .outArrows(point)
        .filter((exit) => table.rules.crossesTrail(state, via(enemyIn, exit), A)).length;

    expect(table.rules.trailChordsAt(spine, point, A).length).toBe(1);
    expect(table.rules.trailChordsAt(knot, point, A).length).toBe(4);
    expect(crossingExits(knot)).toBeGreaterThanOrEqual(crossingExits(spine));
  });
});

// ── Rule: no chord without both an in-arrow and an out-arrow ─────────────────

describe('a trail with nothing on one side of a point presents nothing', () => {
  const sides = [
    { i: 1, o: 0, why: 'the tip of a trail, not yet transited' },
    { i: 0, o: 1, why: 'the first arrow off territory' },
    { i: 0, o: 0, why: 'the trail does not touch the point at all' },
  ] as const;

  it.each(sides)('presents no chord with $i in and $o out — $why', ({ i, o }) => {
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const state = stateOf([], A, {
      trail: { A: [...ins.slice(0, i), ...outs.slice(0, o)] },
    });

    expect(table.rules.trailChordsAt(state, point, A)).toEqual([]);
    for (const into of table.geometry.inArrows(point)) {
      for (const exit of table.geometry.outArrows(point)) {
        expect(table.rules.crossesTrail(state, via(into, exit), A)).toBe(false);
      }
    }
  });

  it('presents no chord where a trail departs a point it never entered', () => {
    // The safety rule means the arrow you departed *from* is territory, not trail —
    // so the first step off home leaves an out-arrow at that point and no in-arrow.
    // Nothing can cross a trail there yet.
    const table = onBoard();
    const t1 = anArrow(table.geometry);
    const point = table.geometry.target(t1);
    const departed = pick(table.geometry.outArrows(point), 0);
    const state = stateOf([{ arrow: departed, owner: A, heads: 1 }], A, {
      trail: { A: [departed] },
      territory: [{ arrow: t1, owner: A }],
    });

    expect(table.rules.trailChordsAt(state, point, A)).toEqual([]);
  });
});

// ── Rule: the two predicates differ exactly by coincidence ───────────────────

describe('the two predicates differ exactly by coincidence', () => {
  it('agrees on every interleave', () => {
    // chordsCross is chordsInterleave widened by coincidence (chord-test spec). On
    // interleave the two must never disagree.
    //
    // The trail chord is *searched for*, not picked: a chord on two **adjacent**
    // slots interleaves with nothing, because no slot lies strictly between its
    // ends. A trail turning through the sharpest angle at a point simply cannot be
    // threaded there — a real geometric fact, and one that makes the obvious choice
    // of `(ins[0], outs[0])` a vacuous test on half the boards.
    const table = onBoard();
    const { point, trailIn, trailOut } = anInterleaving(table.geometry, MINIMAL_DIAMETER);
    const theirs = chordOf(table.geometry, via(trailIn, trailOut));
    const state = stateOf([], A, { trail: { A: [trailIn, trailOut] } });
    let seen = 0;

    for (const into of table.geometry.inArrows(point)) {
      for (const exit of table.geometry.outArrows(point)) {
        const ours = chordOf(table.geometry, via(into, exit));
        if (!chordsInterleave(ours, theirs)) continue;
        seen += 1;
        expect(table.rules.crossesTrail(state, via(into, exit), A)).toBe(true);
        expect(table.rules.selfCrosses(state, via(into, exit), A)).toBe(true);
      }
    }

    // Without this the test passes by finding nothing to check — the one failure
    // mode a "for every X" assertion has, and the reason both halves carry a guard.
    expect(seen).toBeGreaterThan(0);
  });

  it('separates them on a coincidence that does not interleave', () => {
    // The whole difference, and the one place a single shared predicate would have
    // been wrong for §7.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const theirs = chordOf(table.geometry, via(pick(ins, 0), pick(outs, 0)));
    const ourIn = pick(ins, 1);
    const state = stateOf([], A, { trail: { A: [pick(ins, 0), pick(outs, 0)] } });
    let seen = 0;

    for (const exit of table.geometry.outArrows(point)) {
      const ours = chordOf(table.geometry, via(ourIn, exit));
      if (chordsInterleave(ours, theirs) || !chordsCross(ours, theirs)) continue;
      seen += 1;
      expect(table.rules.crossesTrail(state, via(ourIn, exit), A)).toBe(true);
      expect(table.rules.selfCrosses(state, via(ourIn, exit), A)).toBe(false);
    }

    expect(seen).toBeGreaterThan(0);
  });
});

// ── Rule: a verdict is a query ───────────────────────────────────────────────

describe('a verdict is a query', () => {
  it('leaves the state untouched', () => {
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const s0 = stateOf([{ arrow: pick(ins, 1), owner: A, heads: 1 }], A, {
      trail: { A: [pick(ins, 1)], B: [pick(ins, 0), pick(outs, 0)] },
    });
    const snapshotBefore = JSON.stringify({
      groups: [...s0.groups].map(([k, v]) => [String(k), v]),
      trails: [...s0.trails].map(([k, v]) => [String(k), [...v].map(String).toSorted()]),
      territory: [...s0.territory].map(([k, v]) => [String(k), String(v)]),
    });

    for (const exit of table.geometry.outArrows(point)) {
      table.rules.crossesTrail(s0, via(pick(ins, 1), exit), B);
      table.rules.selfCrosses(s0, via(pick(ins, 1), exit), A);
    }
    table.rules.trailChordsAt(s0, point, B);

    expect(
      JSON.stringify({
        groups: [...s0.groups].map(([k, v]) => [String(k), v]),
        trails: [...s0.trails].map(([k, v]) => [String(k), [...v].map(String).toSorted()]),
        territory: [...s0.territory].map(([k, v]) => [String(k), String(v)]),
      }),
    ).toBe(snapshotBefore);
  });

  it('does not depend on the order the trail set was built in', () => {
    // The realistic determinism failure. It passes every example above and surfaces
    // only as replay drift, which is why it is asserted directly.
    const table = onBoard();
    const { point, ins, outs } = junction(table);
    const marked = [pick(ins, 0), pick(ins, 1), pick(outs, 0), pick(outs, 1)];
    const forwards = stateOf([], A, { trail: { A: marked } });
    const backwards = stateOf([], A, { trail: { A: [...marked].reverse() } });
    const enemyIn = pick(ins, 2);

    expect(chordKeys(table.rules.trailChordsAt(backwards, point, A))).toEqual(
      chordKeys(table.rules.trailChordsAt(forwards, point, A)),
    );
    expect(table.rules.trailChordsAt(backwards, point, A)).toEqual(
      table.rules.trailChordsAt(forwards, point, A),
    );
    for (const exit of table.geometry.outArrows(point)) {
      expect(table.rules.crossesTrail(backwards, via(enemyIn, exit), A)).toBe(
        table.rules.crossesTrail(forwards, via(enemyIn, exit), A),
      );
    }
  });

  it('refuses a traversal whose exit is not an out-arrow of the transited point', () => {
    // A traversal that does not follow the grain is not a traversal, and answering
    // "false" would hide the caller's bug (P04 D9's discipline).
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
    const state = stateOf([], A, { trail: { A: [arrowAt(path, 0)] } });

    expect(() =>
      table.rules.crossesTrail(state, via(arrowAt(path, 0), arrowAt(path, 2)), A),
    ).toThrow(ContractViolation);
  });
});

// ── Rule: a crossing needs a traversal, and arriving is not one ──────────────

describe('a crossing needs a traversal, and arriving is not one', () => {
  it('does not cross the trail through the point a head has only arrived at', () => {
    // The step transited the point *behind* it, not the one ahead. A head arrives at
    // a point by standing on an in-arrow of it, and commits only by choosing an exit.
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const from = arrowAt(path, 0);
    const arriving = arrowAt(path, 1);
    const ahead = table.geometry.target(arriving);
    const theirIn = pick(
      table.geometry.inArrows(ahead).filter((a) => a !== arriving),
      0,
    );
    const theirOut = pick(table.geometry.outArrows(ahead), 0);
    const before = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from], B: [theirIn, theirOut] },
    });

    const after = table.rules.apply(before, step(from, arriving, 1));

    // The head now stands on an in-arrow of a point B's trail runs through, and has
    // crossed nothing. Every verdict is still available and none has fired.
    expect(after.groups.get(arriving)?.heads).toBe(1);
    expect(table.rules.trailChordsAt(after, ahead, B).length).toBe(1);
  });

  it('asks about the point the step actually transited', () => {
    // One step, one transited point. Which point is being asked about is the thing
    // most easily got wrong here.
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const from = arrowAt(path, 0);
    const exit = arrowAt(path, 1);
    const behind = table.geometry.target(from);
    const ahead = table.geometry.target(exit);
    const theirIn = pick(
      table.geometry.inArrows(behind).filter((a) => a !== from),
      0,
    );
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from], B: [theirIn, exit] },
    });

    // The verdict is about `behind`, where the chord is drawn — never about `ahead`.
    expect(table.rules.crossesTrail(state, via(from, exit), B)).toBe(true);
    expect(table.rules.trailChordsAt(state, ahead, B).length).toBe(0);
  });
});
