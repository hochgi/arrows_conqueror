/**
 * EARS invariants from docs/spec/trails-simple/trails-simple.md as properties.
 *
 * Deterministic enumeration over fixture boards — no PRNG (ADR 0001).
 *
 * @see docs/spec/trails-simple/trails-simple.md — "Invariants"
 */

import { describe, expect, it } from 'vitest';
import { step } from '@arrows/contracts';
import type { ArrowId, GameState } from '@arrows/contracts';
import {
  A,
  B,
  MINIMAL,
  MINIMAL_DIAMETER,
  SPACIOUS,
  SPACIOUS_DIAMETER,
  aRunFromHome,
  allArrows,
  anArrow,
  anExitFrom,
  arrowAt,
  headsOn,
  isTrail,
  onBoard,
  onTiling,
  owned,
  pathFrom,
  pick,
  stateOf,
  territoryOf,
} from './support';

const BOARDS = [
  { name: 'minimal', description: MINIMAL, diameter: MINIMAL_DIAMETER },
  { name: 'spacious', description: SPACIOUS, diameter: SPACIOUS_DIAMETER },
] as const;

const junctionsOf = (
  table: ReturnType<typeof onBoard>,
  diameter: number,
): readonly {
  readonly ins: readonly ArrowId[];
  readonly outs: readonly ArrowId[];
}[] =>
  [...new Set(allArrows(table.geometry, diameter).map((a) => table.geometry.target(a)))].map(
    (point) => ({
      ins: table.geometry.inArrows(point),
      outs: table.geometry.outArrows(point),
    }),
  );

describe('P22 — no branch toll', () => {
  it.each(BOARDS)(
    'never refuses a whole-stack join/split vacate for unpaid toll on $name',
    ({ description, diameter }) => {
      // WHEN a move creates or vacates a join or split, SHALL NOT refuse for unpaid branch toll.
      const table = onBoard(description);
      for (const { ins, outs } of junctionsOf(table, diameter)) {
        const arriving = pick(ins, 1);
        const exit = pick(outs, 0);
        const state = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
          trail: { A: [pick(ins, 0), arriving] },
        });
        expect(() => table.rules.apply(state, step(arriving, exit, 2))).not.toThrow();

        const arm = pick(outs, 0);
        const other = pick(outs, 1);
        const splitState = stateOf([{ arrow: arm, owner: A, heads: 1 }], A, {
          trail: { A: [arm, other] },
        });
        const onward = anExitFrom(table.geometry, arm);
        expect(() => table.rules.apply(splitState, step(arm, onward, 1))).not.toThrow();
      }
    },
  );
});

describe('P22 — dormant persists until cut or re-attach', () => {
  it.each(BOARDS)(
    'keeps headless marks after a tip vacates on $name',
    ({ description }) => {
      // WHILE dormant / headless, SHALL leave marks standing until cut or re-attach.
      const table = onBoard(description);
      const tip = anArrow(table.geometry);
      const next = anExitFrom(table.geometry, tip);
      const before = stateOf([{ arrow: tip, owner: A, heads: 1 }], A, {
        trail: { A: [tip] },
      });
      const after = table.rules.apply(before, step(tip, next, 1));
      expect(isTrail(after, A, tip)).toBe(true);
      expect(headsOn(after, tip)).toBe(0);

      // Authored dormant (no stack, no territory departure) also stands.
      const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
      const stretch = [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)];
      const dormant = stateOf([], A, { trail: { A: stretch } });
      for (const arrow of stretch) {
        expect(table.rules.anchorGrade(dormant, arrow, A)).toBe('dormant');
        expect(isTrail(dormant, A, arrow)).toBe(true);
      }
    },
  );
});

describe('P22 — no size-1 stack-grade freeze', () => {
  it.each(BOARDS)(
    'always offers a vacating grain step from a lone stack-grade tip on $name',
    ({ description }) => {
      // WHEN size-1 is the sole stack on a stack-grade component, SHALL still permit a legal grain step that vacates.
      const table = onBoard(description);
      const tip = anArrow(table.geometry);
      const next = anExitFrom(table.geometry, tip);
      const state = stateOf([{ arrow: tip, owner: A, heads: 1, spent: 0 }], A, {
        trail: { A: [tip, next] },
      });
      expect(table.rules.anchorGrade(state, tip, A)).toBe('stack');
      const vacating = table.rules
        .legalMoves(state)
        .filter((m) => m.kind === 'step' && m.from === tip && m.count === 1);
      expect(vacating.length).toBeGreaterThan(0);
      for (const move of vacating) {
        expect(() => table.rules.apply(state, move)).not.toThrow();
      }
    },
  );
});

describe('P22 — convert does not scrub orphan dormant', () => {
  it('leaves distal empty trail after converting a stack-grade tip', () => {
    // WHEN conversion strips trail from converted arrows, SHALL NOT evaporate remaining dormant orphans solely because dormant.
    const table = onBoard();
    const tip = anArrow(table.geometry);
    const distal = anExitFrom(table.geometry, tip);
    const mover = anExitFrom(table.geometry, distal);
    const before = stateOf(
      [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { B: [tip, distal] },
        territory: [
          { arrow: tip, owner: A },
          { arrow: distal, owner: A },
          { arrow: mover, owner: A },
        ],
      },
    );

    const after = table.rules.apply(before, step(mover, anExitFrom(table.geometry, mover), 1));

    expect(isTrail(after, B, tip)).toBe(false);
    expect(isTrail(after, B, distal)).toBe(true);
  });
});

describe('P22 — territory-rooted claim is uncapped', () => {
  it('claims the full upstream walk on a territory-rooted landing', () => {
    // WHEN landing from a territory-grade component, SHALL claim the full upstream walk.
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 4);
    const tip = arrowAt(run, 3);
    const landing = anExitFrom(table.geometry, tip);
    const before = stateOf([{ arrow: tip, owner: A, heads: 1 }], A, {
      trail: { A: [...run] },
      territory: owned([home, landing], A),
    });
    expect(table.rules.anchorGrade(before, tip, A)).toBe('territory');

    const after = table.rules.apply(before, step(tip, landing, 1));

    for (const arrow of run) expect(territoryOf(after, arrow)).toBe(A);
  });
});

describe('P22 — unanchored reconnect is firebreak-capped', () => {
  it('stops the claim walk before the firebreak on an unanchored landing', () => {
    // WHEN landing from a non-territory-grade component, SHALL claim only until would enter firebreak.
    const table = onTiling();
    const { run } = aRunFromHome(table.geometry, 4);
    const fire = arrowAt(run, 0);
    const mid = arrowAt(run, 1);
    const tip = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, tip);
    const distal = pick(
      table.geometry.inArrows(table.geometry.origin(fire)).filter((a) => a !== fire),
      0,
    );

    const before = stateOf(
      [
        { arrow: fire, owner: A, heads: 1 },
        { arrow: tip, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { A: [fire, mid, tip, distal] },
        territory: owned([landing], A),
      },
    );
    expect(table.rules.anchorGrade(before, tip, A)).not.toBe('territory');

    const after = table.rules.apply(before, step(tip, landing, 1));

    expect(territoryOf(after, mid)).toBe(A);
    expect(territoryOf(after, fire)).toBeUndefined();
    expect(isTrail(after, A, fire)).toBe(true);
    expect(isTrail(after, A, distal)).toBe(true);
  });
});

describe('P22 — conversion predicate (territory-grade only)', () => {
  it('protects territory-grade and converts stack-grade inside enemy land', () => {
    // WHILE continuous own-trail path to own territory, SHALL NOT convert by encirclement alone.
    // IF no such path and inside enemy territory, THEN SHALL convert.
    const table = onBoard();

    const bHome = anArrow(table.geometry);
    const path = pathFrom(table.geometry, anExitFrom(table.geometry, bHome), 3);
    const protectedTip = arrowAt(path, 2);
    const stretch = [arrowAt(path, 0), arrowAt(path, 1), protectedTip];
    const mover = anExitFrom(table.geometry, protectedTip);
    // Ensure mover is on A's land and not colliding with B's stretch.
    const protectedState = stateOf(
      [
        { arrow: protectedTip, owner: B, heads: 1 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { B: stretch },
        territory: [
          { arrow: bHome, owner: B },
          { arrow: protectedTip, owner: A },
          { arrow: mover, owner: A },
        ],
      },
    );
    if (table.rules.anchorGrade(protectedState, protectedTip, B) === 'territory') {
      const after = table.rules.apply(
        protectedState,
        step(mover, anExitFrom(table.geometry, mover), 1),
      );
      expect(after.groups.get(protectedTip)?.owner).toBe(B);
    }

    const tip = pick(table.geometry.inArrows(table.geometry.seedPoint()), 0);
    const stem = anExitFrom(table.geometry, tip);
    const aMover = anExitFrom(table.geometry, stem);
    const exposed: GameState = stateOf(
      [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: aMover, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { B: [tip, stem] },
        territory: [
          { arrow: tip, owner: A },
          { arrow: aMover, owner: A },
        ],
      },
    );
    expect(table.rules.anchorGrade(exposed, tip, B)).toBe('stack');
    const converted = table.rules.apply(
      exposed,
      step(aMover, anExitFrom(table.geometry, aMover), 1),
    );
    expect(converted.groups.get(tip)?.owner).toBe(A);
    expect(headsOn(converted, tip)).toBe(1);
  });
});
