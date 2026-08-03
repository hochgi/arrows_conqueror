/**
 * One test per scenario in:
 *   docs/spec/move/move.core.feature
 *   docs/spec/move/move.edge-cases.feature
 *
 * A move takes a portion of one arrow's heads one step along an out-arrow.
 * Three variants and no others — splitting, merging, forking and dropping a
 * sentry are all the same move with a different count.
 *
 * Legality is deliberately absent. Whether an exit is really an out-arrow,
 * whether allowance remains, whether a crossing is won, is P04 and later.
 */

import { describe, expect, it } from 'vitest';
import {
  ContractViolation,
  endTurn,
  isSatisfiableBy,
  MOVE_KINDS,
  mintArrowId,
  movesEqual,
  skip,
  step,
  turnsEqual,
} from '../src/index';
import type { Turn } from '../src/index';

const a1 = mintArrowId('a1');
const a2 = mintArrowId('a2');
const a3 = mintArrowId('a3');

describe('move — a step names a source, an exit and a count', () => {
  it('carries exactly three fields and nothing else', () => {
    const m = step(a1, a2, 2);
    expect(Object.keys(m).toSorted()).toEqual(['count', 'exit', 'from', 'kind']);
    expect(m.from).toBe(a1);
    expect(m.exit).toBe(a2);
    expect(m.count).toBe(2);
  });

  it.each([
    { held: 1, count: 1, manoeuvre: 'moving a lone head' },
    { held: 3, count: 3, manoeuvre: 'moving the whole stack' },
    { held: 3, count: 1, manoeuvre: 'sending a scout, leaving a 2-sentry' },
    { held: 3, count: 2, manoeuvre: 'advancing, leaving one head behind' },
  ])('expresses $manoeuvre with one move type', ({ held, count }) => {
    const m = step(a1, a2, count);
    expect(isSatisfiableBy(m, held)).toBe(true);
  });

  it('makes a fork out of two moves from the same source', () => {
    const left = step(a1, a2, 1);
    const right = step(a1, a3, 1);
    expect(isSatisfiableBy(left, 3)).toBe(true);
    expect(isSatisfiableBy(right, 3)).toBe(true);
    expect(movesEqual(left, right)).toBe(false);
  });
});

describe('move — a count must be a positive portion of what is there', () => {
  // ContractViolation, not any throw: a bare `.toThrow()` passes against the
  // phase-2 skeleton and keeps passing in phase 3 without the check existing.
  it.each([0, -1, 1.5])('rejects a count of %s at construction', (count) => {
    expect(() => step(a1, a2, count)).toThrow(ContractViolation);
  });

  it('rejects sending more heads than the source holds', () => {
    expect(isSatisfiableBy(step(a1, a2, 3), 2)).toBe(false);
  });
});

describe('move — skip and end-turn are first-class', () => {
  it('names the arrow that declined to move', () => {
    const m = skip(a1);
    expect(Object.keys(m).toSorted()).toEqual(['from', 'kind']);
    expect(m.from).toBe(a1);
  });

  it('ends a turn without naming an arrow', () => {
    const m = endTurn();
    expect(Object.keys(m)).toEqual(['kind']);
  });

  it('distinguishes an explicit skip from never naming the stack', () => {
    const skipped: Turn = [skip(a1), endTurn()];
    const silent: Turn = [endTurn()];
    expect(turnsEqual(skipped, silent)).toBe(false);
  });

  it('accepts a turn of nothing but skips', () => {
    const turn: Turn = [skip(a1), skip(a2), endTurn()];
    expect(turnsEqual(turn, turn)).toBe(true);
  });

  it('accepts a turn that is empty but for its ending', () => {
    const turn: Turn = [endTurn()];
    expect(turnsEqual(turn, turn)).toBe(true);
  });
});

describe('move — a turn is an ordered list, and order is data', () => {
  it('preserves the order moves were made in', () => {
    const turn: Turn = [step(a1, a2, 1), step(a2, a3, 1), endTurn()];
    expect(turn.map((m) => m.kind)).toEqual(['step', 'step', 'endTurn']);
  });

  it('treats structurally identical moves as equal', () => {
    expect(movesEqual(step(a1, a2, 2), step(a1, a2, 2))).toBe(true);
  });

  it('treats two turns differing only in order as unequal', () => {
    const first: Turn = [step(a1, a2, 1), step(a2, a3, 1)];
    const second: Turn = [step(a2, a3, 1), step(a1, a2, 1)];
    expect(turnsEqual(first, second)).toBe(false);
  });

  it('imposes no limit on how many moves name the same stack', () => {
    const turn: Turn = [step(a1, a2, 1), step(a1, a3, 1), step(a1, a2, 1)];
    expect(turnsEqual(turn, turn)).toBe(true);
  });

  it('leaves the remainder of a split able to act', () => {
    // SPEC §3: on a split both parts inherit `spent`, so only the portion that
    // moved has paid. The DTO must not treat a1 as spent.
    const scout = step(a1, a2, 1);
    const rest = step(a1, a3, 2);
    expect(isSatisfiableBy(scout, 3)).toBe(true);
    expect(isSatisfiableBy(rest, 3)).toBe(true);
  });

  it('lets a rear group step onto an arrow the front group laid', () => {
    // SPEC §6.1a invariant 2: a trail is a set of arrows, so stepping onto one
    // it already holds is legal. A lagging group is ordinary play.
    const front = step(a1, a2, 1);
    const rear = step(a1, a2, 1);
    expect(movesEqual(front, rear)).toBe(true);
    expect(isSatisfiableBy(rear, 2)).toBe(true);
  });
});

describe('move — illegal shapes are unrepresentable', () => {
  it('refuses a step whose source and exit are the same arrow', () => {
    expect(() => step(a1, a1, 2)).toThrow(ContractViolation);
  });

  it('admits exactly three variants', () => {
    expect([...MOVE_KINDS].toSorted()).toEqual(['endTurn', 'skip', 'step']);
    expect(MOVE_KINDS).toHaveLength(3);
  });

  it.each([1, 5, 6])('accepts count %i against a 6-stack', (count) => {
    expect(isSatisfiableBy(step(a1, a2, count), 6)).toBe(true);
  });

  it('accepts taking every head off an arrow', () => {
    expect(isSatisfiableBy(step(a1, a2, 1), 1)).toBe(true);
  });
});
