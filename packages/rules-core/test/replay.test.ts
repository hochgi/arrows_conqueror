/**
 * P10 — replay harness.
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, endTurn, step } from '@conquarrow/contracts';
import type { Move } from '@conquarrow/contracts';
import { replay, replayIsDeterministic } from '../src/replay';
import { A, B, anArrow, anExitFrom, onBoard, owned, snapshot, stateOf } from './support';

describe('replay harness', () => {
  it('folds moves and refuses off-menu steps by default', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const initial = stateOf([{ arrow: from, owner: A, heads: 1 }], A);
    const legal: readonly Move[] = [step(from, exit, 1), endTurn()];
    const final = replay(table.rules, initial, legal);
    expect(final.activePlayer).toBe(B);

    expect(() =>
      replay(table.rules, initial, [step(from, exit, 1), step(from, exit, 1)]),
    ).toThrow(ContractViolation);
  });

  it('is deterministic for equal records', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const exit = anExitFrom(table.geometry, from);
    const initial = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      territory: owned([from, exit], A),
      spawners: [],
    });
    const moves: readonly Move[] = [endTurn(), endTurn()];
    expect(replayIsDeterministic(table.rules, initial, moves, snapshot)).toBe(true);
  });

  it('can skip the legalMoves guard when asked', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const initial = stateOf([{ arrow: from, owner: A, heads: 1, spent: 1 }], A);
    // Skip of an exhausted group is accepted by apply but not offered.
    expect(() =>
      replay(table.rules, initial, [{ kind: 'skip', from }], { requireLegal: false }),
    ).not.toThrow();
  });
});
