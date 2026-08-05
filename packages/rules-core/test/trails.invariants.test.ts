/**
 * The EARS invariants of docs/spec/trails/trails.md and
 * docs/spec/crossings/crossings.md, as properties.
 *
 * Enumerated **deterministically** — every arrow of a fixture board, every point,
 * every (in, out) pair at a point, both boards. No generator and no seed: a
 * randomised counterexample that appears on some runs only is worse than none at
 * all in a codebase whose defining property is that the same inputs give the same
 * answer (ADR 0001).
 *
 * `minimal` is K₇ and dense, which makes it the right board for saturation and
 * chord arithmetic. `spacious` has a non-adjacent pair, which is the only way to
 * author a genuinely disconnected trail stretch — so the grade properties run on
 * both.
 *
 * @see docs/spec/trails/trails.md — "Invariants"
 * @see docs/spec/crossings/crossings.md — "Invariants"
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, chordsCross, chordsInterleave, endTurn, step } from '@arrows/contracts';
import type { GameState } from '@arrows/contracts';
import {
  A,
  B,
  MINIMAL,
  MINIMAL_DIAMETER,
  SPACIOUS,
  SPACIOUS_DIAMETER,
  allArrows,
  anArrow,
  arrowAt,
  chordKeys,
  chordOf,
  exitsFrom,
  isTrail,
  onBoard,
  pathFrom,
  pick,
  stateOf,
  territoryOf,
  trailOf,
  via,
} from './support';

const BOARDS = [
  { name: 'minimal', description: MINIMAL, diameter: MINIMAL_DIAMETER },
  { name: 'spacious', description: SPACIOUS, diameter: SPACIOUS_DIAMETER },
] as const;

// ── marking ──────────────────────────────────────────────────────────────────

describe('a step marks its destination unless that destination is the mover’s territory', () => {
  it.each(BOARDS)('marks every exit of every arrow on $name', ({ description, diameter }) => {
    const table = onBoard(description);
    for (const from of allArrows(table.geometry, diameter)) {
      for (const exit of exitsFrom(table.geometry, from)) {
        const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
          trail: { A: [from] },
        });
        expect(isTrail(table.rules.apply(state, step(from, exit, 1)), A, exit)).toBe(true);
      }
    }
  });

  it.each(BOARDS)('marks nothing when the destination is already own territory on $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    for (const from of allArrows(table.geometry, diameter)) {
      for (const exit of exitsFrom(table.geometry, from)) {
        const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
          territory: [
            { arrow: from, owner: A },
            { arrow: exit, owner: A },
          ],
        });
        const after = table.rules.apply(state, step(from, exit, 1));
        expect(trailOf(after, A)).toEqual([]);
        expect(territoryOf(after, exit)).toBe(A);
      }
    }
  });

  it('marks trail on every arrow of another player’s territory', () => {
    const table = onBoard();
    for (const from of allArrows(table.geometry, MINIMAL_DIAMETER)) {
      for (const exit of exitsFrom(table.geometry, from)) {
        const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
          trail: { A: [from] },
          territory: [{ arrow: exit, owner: B }],
        });
        const after = table.rules.apply(state, step(from, exit, 1));
        expect(isTrail(after, A, exit)).toBe(true);
        expect(territoryOf(after, exit)).toBe(B);
      }
    }
  });

  it('leaves the set unchanged when the destination is already marked', () => {
    const table = onBoard();
    for (const from of allArrows(table.geometry, MINIMAL_DIAMETER)) {
      for (const exit of exitsFrom(table.geometry, from)) {
        const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
          trail: { A: [from, exit] },
        });
        expect(trailOf(table.rules.apply(state, step(from, exit, 1)), A)).toEqual(
          trailOf(state, A),
        );
      }
    }
  });

  it('permits one arrow in both players’ trails', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = pick(exitsFrom(table.geometry, from), 0);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from], B: [exit] },
    });

    const after = table.rules.apply(state, step(from, exit, 1));

    expect(isTrail(after, A, exit)).toBe(true);
    expect(isTrail(after, B, exit)).toBe(true);
  });

  it('keeps trail and territory across the turn boundary', () => {
    const table = onBoard();
    const arrows = allArrows(table.geometry, MINIMAL_DIAMETER);
    const state = stateOf([{ arrow: arrowAt(arrows, 0), owner: A, heads: 2, spent: 1 }], A, {
      trail: { A: [arrowAt(arrows, 0)], B: [arrowAt(arrows, 1)] },
      territory: [{ arrow: arrowAt(arrows, 2), owner: A }],
    });

    const after = table.rules.apply(state, endTurn());

    expect(trailOf(after, A)).toEqual(trailOf(state, A));
    expect(trailOf(after, B)).toEqual(trailOf(state, B));
    expect(territoryOf(after, arrowAt(arrows, 2))).toBe(A);
  });
});

// ── branch anchors ───────────────────────────────────────────────────────────

describe('branching costs an anchor, and only what a move changes is checked', () => {
  /** Every point of a board, with two of its in-arrows and two of its out-arrows. */
  const junctions = (
    table: ReturnType<typeof onBoard>,
    diameter: number,
  ): readonly { point: ReturnType<typeof table.geometry.target>; ins: readonly ReturnType<typeof anArrow>[]; outs: readonly ReturnType<typeof anArrow>[] }[] =>
    [...new Set(allArrows(table.geometry, diameter).map((a) => table.geometry.target(a)))].map(
      (point) => ({
        point,
        ins: table.geometry.inArrows(point),
        outs: table.geometry.outArrows(point),
      }),
    );

  it.each(BOARDS)('refuses every whole-stack join at every point of $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    for (const { ins, outs } of junctions(table, diameter)) {
      const arriving = pick(ins, 1);
      const state = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
        trail: { A: [pick(ins, 0), arriving] },
      });
      expect(() => table.rules.apply(state, step(arriving, pick(outs, 0), 2))).toThrow(
        ContractViolation,
      );
    }
  });

  it.each(BOARDS)('permits every partial join at every point of $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    for (const { ins, outs } of junctions(table, diameter)) {
      const arriving = pick(ins, 1);
      const state = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
        trail: { A: [pick(ins, 0), arriving] },
      });
      const after = table.rules.apply(state, step(arriving, pick(outs, 0), 1));
      expect(after.groups.get(arriving)?.heads).toBe(1);
    }
  });

  it.each([1, 2, 3, 4])('requires both anchors at a crossover, for a %i-stack', (heads) => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const arriving = pick(ins, 1);
    const state = stateOf([{ arrow: arriving, owner: A, heads }], A, {
      trail: { A: [pick(ins, 0), pick(outs, 0), arriving] },
    });
    const move = step(arriving, pick(outs, 1), heads);

    // Moving the whole stack strips the join's anchor whatever the size.
    expect(() => table.rules.apply(state, move)).toThrow(ContractViolation);
    if (heads >= 2) {
      const after = table.rules.apply(state, step(arriving, pick(outs, 1), heads - 1));
      expect(after.groups.get(arriving)?.heads).toBe(1);
    }
  });

  it('refuses a lone head every branching move, everywhere', () => {
    const table = onBoard();
    for (const { ins, outs } of junctions(table, MINIMAL_DIAMETER)) {
      const arriving = pick(ins, 1);
      const state = stateOf([{ arrow: arriving, owner: A, heads: 1 }], A, {
        trail: { A: [pick(ins, 0), arriving] },
      });
      expect(() => table.rules.apply(state, step(arriving, pick(outs, 0), 1))).toThrow(
        ContractViolation,
      );
      expect(state.groups.get(arriving)?.heads).toBe(1);
    }
  });

  it('permits every move that leaves an already-unanchored branch unanchored', () => {
    // The property behind the packet's one deadlock risk. Whatever unpaid branch
    // exists elsewhere, a move that does not touch it must go through.
    const table = onBoard();
    for (const { ins, outs } of junctions(table, MINIMAL_DIAMETER)) {
      const unpaid = [pick(ins, 0), pick(ins, 1), pick(outs, 0)];
      const elsewhere = allArrows(table.geometry, MINIMAL_DIAMETER).find(
        (a) => !unpaid.includes(a) && exitsFrom(table.geometry, a).some((e) => !unpaid.includes(e)),
      );
      if (elsewhere === undefined) continue;
      const exit = pick(
        exitsFrom(table.geometry, elsewhere).filter((e) => !unpaid.includes(e)),
        0,
      );
      const state = stateOf([{ arrow: elsewhere, owner: A, heads: 1 }], A, {
        trail: { A: [...unpaid, elsewhere] },
      });

      expect(() => table.rules.apply(state, step(elsewhere, exit, 1))).not.toThrow();

      // The contrast, so this cannot pass merely because no mandate exists: put a
      // lone head *on* the anchor and the same shape of move is refused.
      const anchored = stateOf([{ arrow: pick(unpaid, 1), owner: A, heads: 1 }], A, {
        trail: { A: unpaid },
      });
      expect(() =>
        table.rules.apply(
          anchored,
          step(pick(unpaid, 1), pick(exitsFrom(table.geometry, pick(unpaid, 1)), 0), 1),
        ),
      ).toThrow(ContractViolation);
    }
  });
});

// ── anchor grade ─────────────────────────────────────────────────────────────

describe('anchor grade is reachability over the trail set', () => {
  it.each(BOARDS)('reports territory grade along a whole stretch on $name', ({ description }) => {
    const table = onBoard(description);
    const t1 = anArrow(table.geometry);
    const path = pathFrom(table.geometry, pick(exitsFrom(table.geometry, t1), 0), 3);
    const stretch = [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)];
    const state = stateOf([], A, {
      trail: { A: stretch },
      territory: [{ arrow: t1, owner: A }],
    });

    for (const arrow of stretch) {
      expect(table.rules.anchorGrade(state, arrow, A)).toBe('territory');
    }
  });

  it.each(BOARDS)('reports stack grade for every arrow of a stack-held stretch on $name', ({
    description,
  }) => {
    const table = onBoard(description);
    const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
    const stretch = [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)];
    const state = stateOf([{ arrow: arrowAt(path, 1), owner: A, heads: 1 }], A, {
      trail: { A: stretch },
    });

    for (const arrow of stretch) {
      expect(table.rules.anchorGrade(state, arrow, A)).toBe('stack');
    }
  });

  it.each(BOARDS)('reports dormant for every arrow of a bare stretch on $name', ({
    description,
  }) => {
    const table = onBoard(description);
    const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
    const stretch = [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)];
    const state = stateOf([], A, { trail: { A: stretch } });

    for (const arrow of stretch) {
      expect(table.rules.anchorGrade(state, arrow, A)).toBe('dormant');
    }
  });

  it('reports the same grade in both directions along a stretch', () => {
    // Undirected, asserted directly: the same stretch read from either end.
    const table = onBoard();
    const t1 = anArrow(table.geometry);
    const path = pathFrom(table.geometry, pick(exitsFrom(table.geometry, t1), 0), 3);
    const state = stateOf([], A, {
      trail: { A: [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)] },
      territory: [{ arrow: t1, owner: A }],
    });

    expect(table.rules.anchorGrade(state, arrowAt(path, 2), A)).toBe(
      table.rules.anchorGrade(state, arrowAt(path, 0), A),
    );
  });

  it('refuses a grade for an arrow outside that player’s trail', () => {
    const table = onBoard();
    for (const arrow of allArrows(table.geometry, MINIMAL_DIAMETER)) {
      const state = stateOf([], A, {});
      expect(() => table.rules.anchorGrade(state, arrow, A)).toThrow(ContractViolation);
    }
  });
});

// ── chord extraction ─────────────────────────────────────────────────────────

describe('a trail presents i × o chords at every point', () => {
  it.each(BOARDS)('gives the product for every (i, o) at every point of $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    const points = [
      ...new Set(allArrows(table.geometry, diameter).map((a) => table.geometry.target(a))),
    ];
    for (const point of points) {
      const ins = table.geometry.inArrows(point);
      const outs = table.geometry.outArrows(point);
      for (let i = 0; i <= 3; i += 1) {
        for (let o = 0; o <= 3; o += 1) {
          const state = stateOf([], A, {
            trail: { A: [...ins.slice(0, i), ...outs.slice(0, o)] },
          });
          const found = table.rules.trailChordsAt(state, point, A);
          expect(found.length).toBe(i * o);
          expect(new Set(chordKeys(found)).size).toBe(i * o);
        }
      }
    }
  });

  it('presents every (in, out) pair and no other', () => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const state = stateOf([], A, { trail: { A: [...ins, ...outs] } });

    const expected = ins.flatMap((into) =>
      outs.map((out) => chordOf(table.geometry, via(into, out))),
    );

    expect(chordKeys(table.rules.trailChordsAt(state, point, A))).toEqual(chordKeys(expected));
  });

  it('returns a stable order across two builds of the same trail', () => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const marked = [...table.geometry.inArrows(point), ...table.geometry.outArrows(point)];
    const forwards = stateOf([], A, { trail: { A: marked } });
    const backwards = stateOf([], A, { trail: { A: [...marked].reverse() } });

    expect(table.rules.trailChordsAt(backwards, point, A)).toEqual(
      table.rules.trailChordsAt(forwards, point, A),
    );
  });
});

// ── the two crossing predicates ──────────────────────────────────────────────

describe('the crossing queries agree with the primitives, chord for chord', () => {
  /** Every trail shape at a point, against every traversal of that point. */
  const sweep = (
    table: ReturnType<typeof onBoard>,
    ask: (state: GameState, into: ReturnType<typeof anArrow>, exit: ReturnType<typeof anArrow>) => boolean,
    predicate: (ours: ReturnType<typeof chordOf>, theirs: ReturnType<typeof chordOf>) => boolean,
  ): void => {
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    for (let i = 1; i <= 3; i += 1) {
      for (let o = 1; o <= 3; o += 1) {
        const marked = [...ins.slice(0, i), ...outs.slice(0, o)];
        const state = stateOf([], A, { trail: { A: marked } });
        const theirChords = ins
          .slice(0, i)
          .flatMap((ti) => outs.slice(0, o).map((to) => chordOf(table.geometry, via(ti, to))));
        for (const into of ins) {
          for (const exit of outs) {
            const ours = chordOf(table.geometry, via(into, exit));
            const expected = theirChords.some((theirs) => predicate(ours, theirs));
            expect(ask(state, into, exit)).toBe(expected);
          }
        }
      }
    }
  };

  it('crossesTrail is chordsCross over every chord the trail presents', () => {
    const table = onBoard();
    sweep(
      table,
      (state, into, exit) => table.rules.crossesTrail(state, via(into, exit), A),
      chordsCross,
    );
  });

  it('selfCrosses is chordsInterleave over every chord the trail presents', () => {
    const table = onBoard();
    sweep(
      table,
      (state, into, exit) => table.rules.selfCrosses(state, via(into, exit), A),
      chordsInterleave,
    );
  });

  it('never reports a self-crossing where the full verdict is coincidence alone', () => {
    // The narrow half, stated as its own property: every place the two disagree is
    // a coincidence, and never the other way round.
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const state = stateOf([], A, { trail: { A: [pick(ins, 0), pick(outs, 0)] } });

    for (const into of ins) {
      for (const exit of outs) {
        const cross = table.rules.crossesTrail(state, via(into, exit), A);
        const self = table.rules.selfCrosses(state, via(into, exit), A);
        expect(self && !cross).toBe(false);
      }
    }
  });

  it('reports no crossing for a player with no trail at the point', () => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const state = stateOf([], A, { trail: { A: [anArrow(table.geometry)] } });

    for (const into of table.geometry.inArrows(point)) {
      for (const exit of table.geometry.outArrows(point)) {
        expect(table.rules.crossesTrail(state, via(into, exit), B)).toBe(false);
      }
    }
  });
});
