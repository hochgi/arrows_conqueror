/**
 * docs/spec/refuse-self-convert/refuse-self-convert.core.feature — one test per
 * rules-side scenario (the two web scenarios live in packages/web).
 *
 * @see docs/spec/refuse-self-convert/refuse-self-convert.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, step } from '@conquarrow/contracts';
import type { Move, StepMove } from '@conquarrow/contracts';
import {
  A,
  B,
  anArrow,
  anExitFrom,
  exitsFrom,
  headsOn,
  isTrail,
  onBoard,
  ownerOf,
  pick,
  snapshot,
  stateOf,
  territoryOf,
} from './support';
import type { ArrowId, GameState } from './support';
import type { Table } from './support';

const WOULD_CONVERT =
  'step onto enemy territory without a territory-grade trail would convert';

const stepsOnto = (
  moves: readonly Move[],
  from: ArrowId,
  exit: ArrowId,
): readonly StepMove[] =>
  moves.filter((m): m is StepMove => m.kind === 'step' && m.from === from && m.exit === exit);

const expectRefused = (run: () => unknown): void => {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContractViolation);
  expect((thrown as ContractViolation).message).toBe(WOULD_CONVERT);
};

/** A's stack-grade fragment on `from`, with `exit` authored as B's empty land. */
const stackGradeAgainstEnemy = (
  table: Table,
  heads: number,
): { readonly from: ArrowId; readonly exit: ArrowId; readonly state: GameState } => {
  const from = anArrow(table.geometry);
  const exit = anExitFrom(table.geometry, from);
  const state = stateOf([{ arrow: from, owner: A, heads }], A, {
    trail: { A: [from] },
    territory: [{ arrow: exit, owner: B }],
  });
  if (table.rules.anchorGrade(state, from, A) !== 'stack') {
    throw new Error(`setup: expected stack-grade at ${String(from)}`);
  }
  return { from, exit, state };
};

const territoryGradeRaid = (
  table: Table,
  heads: number,
): { readonly from: ArrowId; readonly exit: ArrowId; readonly state: GameState } => {
  const from = anArrow(table.geometry);
  const exit = anExitFrom(table.geometry, from);
  const home = pick(table.geometry.inArrows(table.geometry.origin(from)), 0);
  if (home === exit) throw new Error('setup: home collided with the enemy exit');
  const state = stateOf([{ arrow: from, owner: A, heads }], A, {
    trail: { A: [from] },
    territory: [
      { arrow: home, owner: A },
      { arrow: exit, owner: B },
    ],
  });
  if (table.rules.anchorGrade(state, from, A) !== 'territory') {
    throw new Error(`setup: expected territory-grade at ${String(from)}`);
  }
  return { from, exit, state };
};

// ── Rule: Unprotected entry onto foreign territory is illegal ────────────────

describe('unprotected entry onto foreign territory is illegal', () => {
  it('omits and refuses a stack-grade step onto enemy territory', () => {
    // "Stack-grade fragment cannot step onto enemy territory"
    const table = onBoard();
    const { from, exit, state } = stackGradeAgainstEnemy(table, 1);
    const before = snapshot(state);

    expect(stepsOnto(table.rules.legalMoves(state), from, exit)).toEqual([]);
    expectRefused(() => table.rules.apply(state, step(from, exit, 1)));
    expect(snapshot(state)).toEqual(before);
  });

  it('omits and refuses an unmarked stack stepping onto enemy territory', () => {
    // "Unmarked stack on neutral cannot step onto enemy territory"
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      territory: [{ arrow: exit, owner: B }],
    });
    if (isTrail(state, A, from)) throw new Error('setup: from must be unmarked');
    if (territoryOf(state, from) !== undefined) {
      throw new Error('setup: from must be neutral');
    }
    const before = snapshot(state);

    expect(stepsOnto(table.rules.legalMoves(state), from, exit)).toEqual([]);
    expectRefused(() => table.rules.apply(state, step(from, exit, 1)));
    expect(snapshot(state)).toEqual(before);
  });

  it('treats occupied marks that do not reach home as stack-grade, not protection', () => {
    // "Occupied marks that do not reach home are stack-grade and do not protect"
    const table = onBoard();
    const from = anArrow(table.geometry);
    const [exit, stem] = exitsFrom(table.geometry, from);
    if (exit === undefined || stem === undefined) {
      throw new Error('setup: need two grain outs');
    }
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from, stem] },
      territory: [{ arrow: exit, owner: B }],
    });

    expect(table.rules.anchorGrade(state, from, A)).toBe('stack');
    expect(stepsOnto(table.rules.legalMoves(state), from, exit)).toEqual([]);
    expectRefused(() => table.rules.apply(state, step(from, exit, 1)));
  });
});

// ── Rule: Territory-grade and home still raid ────────────────────────────────

describe('territory-grade and home still raid', () => {
  it('keeps a territory-grade trail into enemy land legal and does not convert', () => {
    // "Territory-grade trail into enemy land remains legal and does not convert"
    const table = onBoard();
    const { from, exit, state } = territoryGradeRaid(table, 1);

    const after = table.rules.apply(state, step(from, exit, 1));

    expect(ownerOf(after, exit)).toBe(A);
    expect(headsOn(after, exit)).toBe(1);
    expect(isTrail(after, A, exit)).toBe(true);
    expect(territoryOf(after, exit)).toBe(B);
  });

  it('keeps a step off own territory onto enemy territory legal', () => {
    // "Stepping off own territory onto enemy territory remains legal"
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      territory: [
        { arrow: from, owner: A },
        { arrow: exit, owner: B },
      ],
    });

    const after = table.rules.apply(state, step(from, exit, 1));

    expect(ownerOf(after, exit)).toBe(A);
    expect(isTrail(after, A, exit)).toBe(true);
    expect(territoryOf(after, exit)).toBe(B);
  });

  it('offers coming home onto own territory from a stack-grade fragment', () => {
    // "Coming home onto own territory is not this refusal"
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from] },
      territory: [{ arrow: exit, owner: A }],
    });
    if (table.rules.anchorGrade(state, from, A) !== 'stack') {
      throw new Error('setup: coming-home fragment must stay stack-grade');
    }

    expect(stepsOnto(table.rules.legalMoves(state), from, exit).length).toBeGreaterThan(0);
  });
});

// ── Rule: Neutral is not the trap ────────────────────────────────────────────

describe('neutral is not the trap', () => {
  it('keeps a stack-grade step onto unclaimed ground legal', () => {
    // "Stack-grade step onto unclaimed ground remains legal"
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: [from] },
    });
    if (table.rules.anchorGrade(state, from, A) !== 'stack') {
      throw new Error('setup: expected stack-grade fragment');
    }
    if (territoryOf(state, exit) !== undefined) {
      throw new Error('setup: exit must be unclaimed');
    }

    expect(stepsOnto(table.rules.legalMoves(state), from, exit).length).toBeGreaterThan(0);
    const after = table.rules.apply(state, step(from, exit, 1));
    expect(ownerOf(after, exit)).toBe(A);
    expect(headsOn(after, exit)).toBe(1);
  });
});
