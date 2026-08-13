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
import { ContractViolation, chordsCross, chordsInterleave, endTurn, step } from '@conquarrow/contracts';
import type { GameState } from '@conquarrow/contracts';
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
import type { ArrowId, PointId } from './support';

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
        // Territory-grade lifeline so conversion does not strip the fresh mark (P13).
        const home = pick(table.geometry.inArrows(table.geometry.origin(from)), 0);
        const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
          trail: { A: [from] },
          territory: [
            { arrow: exit, owner: B },
            { arrow: home, owner: A },
          ],
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

  it('cuts the enemy when stepping onto a trail arrow they already hold', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = pick(exitsFrom(table.geometry, from), 0);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from], B: [exit] },
    });

    const after = table.rules.apply(state, step(from, exit, 1));

    expect(isTrail(after, A, exit)).toBe(true);
    expect(isTrail(after, B, exit)).toBe(false);
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

/**
 * Every point of a board, with its three in-arrows and three out-arrows.
 *
 * Module-level because both the branch properties and the crossing sweeps enumerate
 * points, and a board is small enough that "every point" is the only honest scope.
 */
const junctionsOf = (
  table: ReturnType<typeof onBoard>,
  diameter: number,
): readonly {
  point: PointId;
  ins: readonly ArrowId[];
  outs: readonly ArrowId[];
}[] =>
  [...new Set(allArrows(table.geometry, diameter).map((a) => table.geometry.target(a)))].map(
    (point) => ({
      point,
      ins: table.geometry.inArrows(point),
      outs: table.geometry.outArrows(point),
    }),
  );

describe('branching is free — joins and splits never refuse for toll (P22)', () => {
  const junctions = junctionsOf;

  it.each(BOARDS)('permits every whole-stack join at every point of $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    for (const { ins, outs } of junctions(table, diameter)) {
      const arriving = pick(ins, 1);
      const state = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
        trail: { A: [pick(ins, 0), arriving] },
      });
      const after = table.rules.apply(state, step(arriving, pick(outs, 0), 2));
      expect(after.groups.get(arriving)).toBeUndefined();
      expect(after.groups.get(pick(outs, 0))?.heads).toBe(2);
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

  it.each([1, 2, 3, 4])('permits a whole-stack crossover for a %i-stack', (heads) => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const arriving = pick(ins, 1);
    const state = stateOf([{ arrow: arriving, owner: A, heads }], A, {
      trail: { A: [pick(ins, 0), pick(outs, 0), arriving] },
    });
    const move = step(arriving, pick(outs, 1), heads);

    const after = table.rules.apply(state, move);
    expect(after.groups.get(arriving)).toBeUndefined();
    expect(after.groups.get(pick(outs, 1))?.heads).toBe(heads);
  });

  const aSplitArmToVacate = (
    table: ReturnType<typeof onBoard>,
    diameter: number,
  ): { arm: ArrowId; other: ArrowId; exit: ArrowId } | undefined => {
    for (const { outs } of junctions(table, diameter)) {
      for (const arm of outs) {
        const other = outs.find((o) => o !== arm);
        if (other === undefined) continue;
        for (const exit of exitsFrom(table.geometry, arm)) {
          const after = [arm, other, exit];
          const ahead = table.geometry.target(arm);
          const feeding = table.geometry.inArrows(ahead).filter((a) => after.includes(a));
          if (feeding.length === 1) return { arm, other, exit };
        }
      }
    }
    return undefined;
  };

  it.each(BOARDS)('permits walking the last head off a split’s arm on $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    const found = aSplitArmToVacate(table, diameter);
    if (found === undefined) throw new Error('setup: no split with an unbranched continuation');
    const { arm, other, exit } = found;
    const trail = [arm, other];

    const after = table.rules.apply(
      stateOf([{ arrow: arm, owner: A, heads: 1 }], A, { trail: { A: trail } }),
      step(arm, exit, 1),
    );
    expect(after.groups.get(arm)).toBeUndefined();
    expect(after.groups.get(exit)?.heads).toBe(1);
    expect(isTrail(after, A, other)).toBe(true);
  });

  it.each(BOARDS)('permits vacating a split arm whether or not a sibling holds it on $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    const found = aSplitArmToVacate(table, diameter);
    if (found === undefined) throw new Error('setup: no split with an unbranched continuation');
    const { arm, other, exit } = found;
    const trail = [arm, other];

    const withSibling = table.rules.apply(
      stateOf(
        [
          { arrow: arm, owner: A, heads: 1 },
          { arrow: other, owner: A, heads: 1 },
        ],
        A,
        { trail: { A: trail } },
      ),
      step(arm, exit, 1),
    );
    expect(withSibling.groups.get(arm)).toBeUndefined();
    expect(withSibling.groups.get(other)?.heads).toBe(1);

    const alone = table.rules.apply(
      stateOf([{ arrow: arm, owner: A, heads: 1 }], A, { trail: { A: trail } }),
      step(arm, exit, 1),
    );
    expect(alone.groups.get(arm)).toBeUndefined();
    expect(alone.groups.get(exit)?.heads).toBe(1);
  });

  it('lets a mover vacate a join even when an enemy stands on a sibling strand', () => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const leaving = pick(ins, 0);
    const occupied = pick(ins, 1);
    const trail = [leaving, occupied, pick(outs, 0)];

    const after = table.rules.apply(
      stateOf(
        [
          { arrow: leaving, owner: A, heads: 1 },
          { arrow: occupied, owner: B, heads: 2 },
        ],
        A,
        { trail: { A: trail } },
      ),
      step(leaving, pick(outs, 0), 1),
    );
    expect(after.groups.get(leaving)).toBeUndefined();
    expect(after.groups.get(pick(outs, 0))?.heads).toBe(1);
  });

  it('lets a join’s last head leave whether or not a sibling in-arrow holds', () => {
    const table = onBoard();
    const point = table.geometry.target(anArrow(table.geometry));
    const ins = table.geometry.inArrows(point);
    const outs = table.geometry.outArrows(point);
    const leaving = pick(ins, 0);
    const sibling = pick(ins, 1);
    const trail = [leaving, sibling, pick(outs, 0)];
    const move = step(leaving, pick(outs, 0), 1);

    const withSibling = table.rules.apply(
      stateOf(
        [
          { arrow: leaving, owner: A, heads: 1 },
          { arrow: sibling, owner: A, heads: 1 },
        ],
        A,
        { trail: { A: trail } },
      ),
      move,
    );
    expect(withSibling.groups.get(leaving)).toBeUndefined();
    expect(withSibling.groups.get(sibling)?.heads).toBe(1);

    const alone = table.rules.apply(
      stateOf([{ arrow: leaving, owner: A, heads: 1 }], A, { trail: { A: trail } }),
      move,
    );
    expect(alone.groups.get(leaving)).toBeUndefined();
  });

  it('permits leaving a trail join from either territory or trail', () => {
    const table = onBoard();
    for (const { ins, outs } of junctions(table, MINIMAL_DIAMETER)) {
      const leaving = pick(ins, 0);
      const joined = [pick(ins, 1), pick(ins, 2)];
      const move = step(leaving, pick(outs, 0), 1);

      const off = table.rules.apply(
        stateOf([{ arrow: leaving, owner: A, heads: 1 }], A, {
          trail: { A: joined },
          territory: [{ arrow: leaving, owner: A }],
        }),
        move,
      );
      expect(off.groups.get(pick(outs, 0))?.heads).toBe(1);

      const fromTrail = table.rules.apply(
        stateOf([{ arrow: leaving, owner: A, heads: 1 }], A, {
          trail: { A: [leaving, ...joined] },
        }),
        move,
      );
      expect(fromTrail.groups.get(pick(outs, 0))?.heads).toBe(1);
    }
  });

  it('lets a lone head make every branching move, everywhere', () => {
    const table = onBoard();
    for (const { ins, outs } of junctions(table, MINIMAL_DIAMETER)) {
      const arriving = pick(ins, 1);
      const state = stateOf([{ arrow: arriving, owner: A, heads: 1 }], A, {
        trail: { A: [pick(ins, 0), arriving] },
      });
      const after = table.rules.apply(state, step(arriving, pick(outs, 0), 1));
      expect(after.groups.get(arriving)).toBeUndefined();
      expect(after.groups.get(pick(outs, 0))?.heads).toBe(1);
    }
  });

  it('permits every move that leaves an already-unanchored branch unanchored', () => {
    const table = onBoard();
    let checked = 0;
    for (const { ins, outs } of junctions(table, MINIMAL_DIAMETER)) {
      const unpaid = [pick(ins, 0), pick(ins, 1), pick(outs, 0)];
      // Any elsewhere step that does not need to be a non-branch — all steps are free.
      const from = allArrows(table.geometry, MINIMAL_DIAMETER).find((a) => !unpaid.includes(a));
      if (from === undefined) continue;
      const exit = exitsFrom(table.geometry, from).find((e) => !unpaid.includes(e));
      if (exit === undefined) continue;
      checked += 1;
      const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
        trail: { A: [...unpaid, from] },
      });
      expect(() => table.rules.apply(state, step(from, exit, 1))).not.toThrow();

      // Anchored vacate is also legal under P22.
      const anchored = stateOf([{ arrow: pick(unpaid, 1), owner: A, heads: 1 }], A, {
        trail: { A: unpaid },
      });
      expect(() =>
        table.rules.apply(
          anchored,
          step(pick(unpaid, 1), pick(exitsFrom(table.geometry, pick(unpaid, 1)), 0), 1),
        ),
      ).not.toThrow();
    }
    expect(checked).toBeGreaterThan(0);
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

  /**
   * Two stretches of trail sharing no point, so neither can anchor the other.
   *
   * Point-disjoint, not merely arrow-disjoint: connectivity is over shared points
   * (D7), so two stretches that avoid each other's *arrows* can still be one stretch.
   */
  const twoSeparateStretches = (
    table: ReturnType<typeof onBoard>,
    diameter: number,
  ): { held: readonly ArrowId[]; loose: readonly ArrowId[] } | undefined => {
    const chains = allArrows(table.geometry, diameter).flatMap((first) =>
      exitsFrom(table.geometry, first).map((second) => [first, second] as readonly ArrowId[]),
    );
    const pointsOf = (chain: readonly ArrowId[]): ReadonlySet<string> =>
      new Set(
        chain.flatMap((a) => [
          String(table.geometry.origin(a)),
          String(table.geometry.target(a)),
        ]),
      );
    for (const held of chains) {
      const touched = pointsOf(held);
      const loose = chains.find((c) => [...pointsOf(c)].every((p) => !touched.has(p)));
      if (loose !== undefined) return { held, loose };
    }
    return undefined;
  };

  it.each(BOARDS)('anchors only the stretch a stack actually stands on, on $name', ({
    description,
    diameter,
  }) => {
    // §6.1: "trail beyond a halting stack is anchored *on that stack*" — the anchor is
    // local to the stretch, not a property of owning a stack somewhere. Without this
    // one parked group would make every mark on the board live, and `dormant` would be
    // unreachable in a real game.
    const table = onBoard(description);
    const found = twoSeparateStretches(table, diameter);
    if (found === undefined) throw new Error('setup: no two point-disjoint stretches');
    const { held, loose } = found;
    const state = stateOf([{ arrow: pick(held, 0), owner: A, heads: 2 }], A, {
      trail: { A: [...held, ...loose] },
    });

    for (const arrow of held) expect(table.rules.anchorGrade(state, arrow, A)).toBe('stack');
    for (const arrow of loose) expect(table.rules.anchorGrade(state, arrow, A)).toBe('dormant');
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
  /**
   * Every trail shape at **every point of a board**, against every traversal of it.
   *
   * Run on both fixtures, which is what makes it the *board-independence* property
   * (`crossings.edge-cases.feature`, "the verdict does not depend on which board
   * implementation answers"). That scenario asks for two isomorphic boards and there
   * are none — `minimal` has 7 points and `spacious` 8 — so the realizable form of it
   * is this: the verdict must equal the primitive applied to the slots the *port*
   * reports, at every point of every board. An engine that leaned on anything
   * board-specific, or inferred a slot from an arrow id, fails on the second board.
   *
   * The sweep is exhaustive rather than sampled: 9 trail shapes × 9 traversals × every
   * point, twice over, which is 1,134 verdicts and still runs in milliseconds.
   */
  const sweep = (
    table: ReturnType<typeof onBoard>,
    diameter: number,
    ask: (state: GameState, into: ArrowId, exit: ArrowId) => boolean,
    predicate: (ours: ReturnType<typeof chordOf>, theirs: ReturnType<typeof chordOf>) => boolean,
  ): void => {
    let checked = 0;
    for (const { ins, outs } of junctionsOf(table, diameter)) {
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
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  };

  it.each(BOARDS)('crossesTrail is chordsCross over every chord, everywhere on $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    sweep(
      table,
      diameter,
      (state, into, exit) => table.rules.crossesTrail(state, via(into, exit), A),
      chordsCross,
    );
  });

  it.each(BOARDS)('crossesTrail treats a stub out as coincide, everywhere on $name', ({
    description,
    diameter,
  }) => {
    // SPEC §2: coincide is "exit is a trail arrow", which `i × o` chords miss when
    // i = 0. Turning onto a different out at that point is still not a crossing.
    const table = onBoard(description);
    let checked = 0;
    for (const { ins, outs } of junctionsOf(table, diameter)) {
      for (let o = 1; o <= 3; o += 1) {
        const marked = outs.slice(0, o);
        const state = stateOf([], A, { trail: { A: marked } });
        for (const into of ins) {
          for (const exit of outs) {
            expect(table.rules.crossesTrail(state, via(into, exit), A)).toBe(marked.includes(exit));
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(BOARDS)('selfCrosses is chordsInterleave over every chord, everywhere on $name', ({
    description,
    diameter,
  }) => {
    const table = onBoard(description);
    sweep(
      table,
      diameter,
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
