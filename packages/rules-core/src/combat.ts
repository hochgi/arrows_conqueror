/**
 * Contact combat — threat-weighted floor losses on an enemy-occupied arrow.
 *
 * SPEC §6.2 (contact combat), §11 items 6, 10, **37**, **38**. P06 decisions
 * D5–D6, D8.
 *
 * An attack is an ordinary step whose destination holds an enemy group. *A* is
 * the step's `count` (with stay-behind: `count ≤ heads − 1`), *D* the defender
 * heads. Loss weights are the integer form *wa*∶*wd* = *D*² ∶ *A*(*A*+*D*);
 * magnitude scales so max = *D*; then cap and floor. Rounds repeat until one
 * side is wiped (fight-to-wipe). Exact arithmetic only (ADR 0001) — no floats,
 * no randomness.
 *
 * @see docs/spec/combat/combat.md
 */

import { ContractViolation } from '@arrows/contracts';
import type { CombatLosses, GeometryPort } from '@arrows/contracts';

/** Remaining heads after a fight-to-wipe battle. */
export interface BattleOutcome {
  readonly aRem: number;
  readonly dRem: number;
}

/** The combat query P06 adds to `RulesPort`. */
export interface CombatRules {
  /**
   * Threat-weighted floor losses for one round of *A* attacking *D* (§6.2).
   *
   * Pure: no board, no state. Caps keep losses inside `[0, A]` and `[0, D]`.
   */
  readonly combatLosses: (attackerCount: number, defenderHeads: number) => CombatLosses;
}

const requirePositiveInt = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new ContractViolation(`${label} must be a positive integer, got ${String(value)}`);
  }
};

/**
 * §6.2 one-round loss table: scale so max(*atk*, *def*) = *D*, preserving
 * *wa*∶*wd*, then cap and floor. The both-floors-0 clause is defensive under
 * max=*D* for positive *A*, *D*, but is implemented as written.
 */
export const combatLosses = (attackerCount: number, defenderHeads: number): CombatLosses => {
  requirePositiveInt(attackerCount, 'attackerCount');
  requirePositiveInt(defenderHeads, 'defenderHeads');

  const A = attackerCount;
  const D = defenderHeads;
  // wa∶wd = D² ∶ A(A+D)
  const wa = D * D;
  const wd = A * (A + D);
  const maxW = wa >= wd ? wa : wd;

  // floor(D * w / maxW), then cap — equivalent to cap-then-floor for integer caps.
  let atk = Math.min(A, Math.floor((D * wa) / maxW));
  let def = Math.min(D, Math.floor((D * wd) / maxW));

  if (atk === 0 && def === 0 && (wa > 0 || wd > 0)) {
    if (wa > wd) atk = 1;
    else def = 1; // ties → defender
  }

  return { attacker: atk, defender: def };
};

/**
 * Fight-to-wipe (§6.2 / item 38): loop the floor rule until *A* or *D* is 0.
 *
 * Under the current magnitude step a single round already wipes one side for
 * positive integer *A*, *D*; the loop states the HoMM intent if the table is
 * retuned. A stuck round (0,0 losses) refuses rather than spinning forever.
 */
export const resolveBattle = (attackerCount: number, defenderHeads: number): BattleOutcome => {
  requirePositiveInt(attackerCount, 'attackerCount');
  requirePositiveInt(defenderHeads, 'defenderHeads');

  let a = attackerCount;
  let d = defenderHeads;
  let guard = 0;
  while (a > 0 && d > 0) {
    const { attacker, defender } = combatLosses(a, d);
    if (attacker === 0 && defender === 0) {
      throw new ContractViolation(
        `battle round produced zero losses for A=${String(a)}, D=${String(d)}`,
      );
    }
    a -= attacker;
    d -= defender;
    guard += 1;
    if (guard > 1000) {
      throw new ContractViolation('battle did not terminate');
    }
  }
  return { aRem: a, dRem: d };
};

/**
 * Build the combat rules over a board.
 *
 * The board is unused by the pure *A*, *D* query; it arrives for symmetry with the
 * other halves of `makeRules`.
 */
export const makeCombatRules = (_geometry: GeometryPort): CombatRules => ({
  combatLosses,
});
