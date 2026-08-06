/**
 * docs/spec/combat/combat.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/combat/combat.md
 */

import { describe, expect, it } from 'vitest';
import { step } from '@arrows/contracts';
import {
  A,
  B,
  anArrow,
  anExitFrom,
  headsOn,
  onBoard,
  ownerOf,
  snapshot,
  spentOn,
  stateOf,
} from './support';

// ── Rule: floor tie-break and caps ───────────────────────────────────────────

describe('floor tie-break and caps', () => {
  /**
   * Kickback (phase 1): under the stated magnitude step — scale so
   * max(atk_loss, def_loss) = D — one side's pre-floor loss is exactly D ≥ 1 for
   * every positive integer A, D. The both-floors-0 clause is therefore unreachable.
   *
   * The scenario stays in the suite as a `combatLosses` assertion so phase 3
   * keeps the seam, and the kickback asks phase 1 whether to strike the clause or
   * revise the magnitude rule. Until then this fails on `not implemented`, which
   * is the right red for a missing query — not a fabricated A,D pair.
   */
  it('deals 1 to the larger weight when both floors would be 0', () => {
    const table = onBoard();
    // Placeholder A,D: the query must exist. Phase 1 supplies the pair that
    // reaches both-floors-0, or strikes the scenario.
    const losses = table.rules.combatLosses(1, 1);
    expect(losses.attacker + losses.defender).toBeGreaterThanOrEqual(1);
  });

  it('never loses more than A attacker heads or D defender heads', () => {
    const table = onBoard();
    for (let attack = 1; attack <= 8; attack += 1) {
      for (let defence = 1; defence <= 8; defence += 1) {
        const losses = table.rules.combatLosses(attack, defence);
        expect(losses.attacker).toBeLessThanOrEqual(attack);
        expect(losses.defender).toBeLessThanOrEqual(defence);
        expect(losses.attacker).toBeGreaterThanOrEqual(0);
        expect(losses.defender).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── Rule: partial step counts and stay-behind ────────────────────────────────

describe('partial step counts and stay-behind', () => {
  it('fights only with the stepping count — remainder on the source is untouched', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const e1 = anExitFrom(table.geometry, from);
    const before = stateOf(
      [
        { arrow: from, owner: A, heads: 4 },
        { arrow: e1, owner: B, heads: 2 },
      ],
      A,
    );

    const after = table.rules.apply(before, step(from, e1, 2));

    // Losses with A=2, D=2 → attacker 1 lands, remainder 2 stay on from.
    expect(headsOn(after, from)).toBe(2);
    expect(ownerOf(after, from)).toBe(A);
    expect(ownerOf(after, e1)).toBe(A);
    expect(headsOn(after, e1)).toBe(1);
    // Remainder did not pay the step.
    expect(spentOn(after, from)).toBe(0);
  });

  it('omits emptying attacks and lone-head attacks from legalMoves', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const e1 = anExitFrom(table.geometry, from);

    const lone = stateOf(
      [
        { arrow: from, owner: A, heads: 1 },
        { arrow: e1, owner: B, heads: 1 },
      ],
      A,
    );
    expect(
      table.rules.legalMoves(lone).some(
        (m) => m.kind === 'step' && m.from === from && m.exit === e1,
      ),
    ).toBe(false);

    const stack = stateOf(
      [
        { arrow: from, owner: A, heads: 3 },
        { arrow: e1, owner: B, heads: 1 },
      ],
      A,
    );
    const attackCounts = table.rules
      .legalMoves(stack)
      .filter((m) => m.kind === 'step' && m.from === from && m.exit === e1)
      .map((m) => (m.kind === 'step' ? m.count : 0));
    expect(attackCounts).toEqual([1, 2]);
  });
});

// ── Rule: purity and determinism ─────────────────────────────────────────────

describe('combat resolution is pure and deterministic', () => {
  it('does not mutate the input state', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const e1 = anExitFrom(table.geometry, from);
    const s0 = stateOf(
      [
        { arrow: from, owner: A, heads: 4 },
        { arrow: e1, owner: B, heads: 3 },
      ],
      A,
    );
    const before = snapshot(s0);

    const s1 = table.rules.apply(s0, step(from, e1, 3));

    expect(snapshot(s0)).toEqual(before);
    expect(snapshot(s1)).not.toEqual(before);
  });

  it('yields equal combat outcomes from equal inputs', () => {
    const table = onBoard();
    const from = anArrow(table.geometry);
    const e1 = anExitFrom(table.geometry, from);
    const state = stateOf(
      [
        { arrow: from, owner: A, heads: 4 },
        { arrow: e1, owner: B, heads: 3 },
      ],
      A,
    );
    const move = step(from, e1, 3);

    expect(snapshot(table.rules.apply(state, move))).toEqual(
      snapshot(table.rules.apply(state, move)),
    );
  });

  it('computes losses with exact arithmetic and no randomness', () => {
    // ADR 0001. Integer cross-products — never Math.random, never float.
    // Pin the equals table and 5v3 through the pure query.
    const table = onBoard();
    expect(table.rules.combatLosses(1, 1)).toEqual({ attacker: 0, defender: 1 });
    expect(table.rules.combatLosses(2, 2)).toEqual({ attacker: 1, defender: 2 });
    expect(table.rules.combatLosses(3, 3)).toEqual({ attacker: 1, defender: 3 });
    expect(table.rules.combatLosses(4, 4)).toEqual({ attacker: 2, defender: 4 });
    expect(table.rules.combatLosses(5, 3)).toEqual({ attacker: 0, defender: 3 });
    expect(table.rules.combatLosses(1, 3)).toEqual({ attacker: 1, defender: 1 });
  });
});
