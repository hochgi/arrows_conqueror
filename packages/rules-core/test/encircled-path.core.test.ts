/**
 * docs/spec/encircled-path/encircled-path.core.feature — one test per scenario.
 *
 * @see docs/spec/encircled-path/encircled-path.md
 */

import { describe, expect, it } from 'vitest';
import { step } from '@conquarrow/contracts';
import {
  A,
  B,
  aRunFromHome,
  allArrows,
  anArrow,
  anExitFrom,
  arrowAt,
  exitsFrom,
  headsOn,
  isTrail,
  onBoard,
  onTiling,
  owned,
  ownerOf,
  pathFrom,
  pick,
  slotsAt,
  stateOf,
  territoryOf,
  via,
} from './support';
import type { ArrowId } from './support';

// ── Rule: Convert wipe clears the encircled path ─────────────────────────────

describe('convert wipe clears the encircled path', () => {
  it('converts a stack-grade raider and evaporates its empty trail on the claimer’s land', () => {
    // encircled-path.core: "A converted stack-grade raider loses its empty trail on the claimer's land"
    const table = onBoard();
    const tip = anArrow(table.geometry);
    const distal = anExitFrom(table.geometry, tip);
    const mover = anExitFrom(table.geometry, distal);
    const before = stateOf(
      [
        { arrow: tip, owner: B, heads: 2 },
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
    expect(table.rules.anchorGrade(before, tip, B)).toBe('stack');

    const after = table.rules.apply(before, step(mover, anExitFrom(table.geometry, mover), 1));

    expect(ownerOf(after, tip)).toBe(A);
    expect(headsOn(after, tip)).toBe(2);
    expect(isTrail(after, B, tip)).toBe(false);
    expect(isTrail(after, B, distal)).toBe(false);
  });

  it('leaves no connecting victim trail between two converted stacks', () => {
    // encircled-path.core: "Two converted stacks leave no connecting victim trail"
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
    const first = arrowAt(path, 0);
    const mid = arrowAt(path, 1);
    const second = arrowAt(path, 2);
    const { from: mover, exit, before } = anUnrelatedAdvance(table, path, (from, dest) =>
      stateOf(
        [
          { arrow: first, owner: B, heads: 1 },
          { arrow: second, owner: B, heads: 1 },
          { arrow: from, owner: A, heads: 1 },
        ],
        A,
        {
          trail: { B: [first, mid, second] },
          territory: owned([first, mid, second, from, dest], A),
        },
      ),
    );
    expect(table.rules.anchorGrade(before, first, B)).toBe('stack');
    expect(table.rules.anchorGrade(before, second, B)).toBe('stack');

    const after = table.rules.apply(before, step(mover, exit, 1));

    expect(ownerOf(after, first)).toBe(A);
    expect(ownerOf(after, second)).toBe(A);
    expect(isTrail(after, B, first)).toBe(false);
    expect(isTrail(after, B, second)).toBe(false);
    expect(isTrail(after, B, mid)).toBe(false);
  });

  it('leaves no enemy trail on tiles claimed by closing around a garrison', () => {
    // encircled-path.core: "Closing around a garrison leaves no enemy trail on claimed tiles"
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const mid = arrowAt(run, 1);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const before = stateOf(
      [
        { arrow: last, owner: A, heads: 1 },
        { arrow: occupied, owner: B, heads: 1 },
      ],
      A,
      {
        trail: { A: [...run], B: [occupied, mid] },
        territory: owned([home, landing], A),
      },
    );
    expect(table.rules.anchorGrade(before, occupied, B)).not.toBe('territory');

    const after = table.rules.apply(before, step(last, landing, 1));

    for (const arrow of run) {
      expect(territoryOf(after, arrow)).toBe(A);
      expect(isTrail(after, B, arrow)).toBe(false);
    }
    expect(ownerOf(after, occupied)).toBe(A);
  });

  it('evaporates both arms of a converted fork', () => {
    // encircled-path.core: "A converted fork loses both arms"
    const table = onBoard();
    const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
    const stem = pick(ins, 0);
    const arm0 = pick(outs, 0);
    const arm1 = pick(outs, 1);
    const fork = [stem, arm0, arm1] as const;
    const { from: mover, exit, before } = anUnrelatedAdvance(table, fork, (from, dest) =>
      stateOf(
        [
          { arrow: stem, owner: B, heads: 1 },
          { arrow: from, owner: A, heads: 1 },
        ],
        A,
        {
          trail: { B: [...fork] },
          territory: owned([...fork, from, dest], A),
        },
      ),
    );
    expect(table.rules.anchorGrade(before, stem, B)).toBe('stack');

    const after = table.rules.apply(before, step(mover, exit, 1));

    expect(ownerOf(after, stem)).toBe(A);
    expect(isTrail(after, B, stem)).toBe(false);
    expect(isTrail(after, B, arm0)).toBe(false);
    expect(isTrail(after, B, arm1)).toBe(false);
  });
});

/** An A step that does not land on `blocked`, does not fight B, and does not cut B's trail. */
const anUnrelatedAdvance = (
  table: ReturnType<typeof onBoard>,
  blocked: readonly ArrowId[],
  occupancyAndGround: (from: ArrowId, exit: ArrowId) => ReturnType<typeof stateOf>,
): { from: ArrowId; exit: ArrowId; before: ReturnType<typeof stateOf> } => {
  const blockedSet = new Set(blocked.map(String));
  for (const from of allArrows(table.geometry, 2)) {
    if (blockedSet.has(String(from))) continue;
    for (const exit of exitsFrom(table.geometry, from)) {
      if (from === exit || blockedSet.has(String(exit))) continue;
      const before = occupancyAndGround(from, exit);
      if (before.groups.get(from)?.owner !== A) continue;
      const standing = before.groups.get(exit);
      if (standing !== undefined && standing.owner !== A) continue;
      if (table.rules.crossesTrail(before, via(from, exit), B)) continue;
      return { from, exit, before };
    }
  }
  throw new Error("setup: no unrelated advance that avoids B's trail");
};
