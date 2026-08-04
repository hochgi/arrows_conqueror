/**
 * Exact rational arithmetic.
 *
 * SPEC §7 — spawner accrual. ADR 0001 — never floating point.
 *
 * Exactness is a product property, not a preference. Coprime denominators over a
 * round-robin are what produce "deterministic irregularity": a rhythm complex
 * enough to feel organic while staying computable by an attentive player. Five
 * additions of 7/36 fall short of 1 and six overshoot it — an implementation
 * carrying an epsilon lands on the wrong side of that boundary, and then every
 * subsequent carry is wrong too.
 *
 * Movement no longer lives here. §3 replaced the harmonic curve with
 * `speed(N) = 1 + floor(log2 N)` — whole steps, nothing banked — so allowance is
 * an integer and lives in ./move. **Movement is integer, economy is exact**: a
 * spawner's trickle has to be bankable, whereas tempo you did not spend is tempo
 * you gave away.
 */

import { reject } from './errors';

/** Always normalized to lowest terms, with a positive denominator. */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

/** Euclid. Integer-only, and `b` is always positive here so it terminates. */
const gcd = (a: number, b: number): number => {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

/**
 * Construct a rational in lowest terms.
 *
 * Throws {@link ContractViolation} on a zero denominator, a non-integer term, or
 * any negative value: neither a force nor an accumulator is ever negative, and
 * refusing to represent one makes an underflow bug unrepresentable rather than
 * merely detectable.
 */
export const rational = (num: number, den: number): Rational => {
  if (!Number.isInteger(num) || !Number.isInteger(den)) {
    reject(`a rational is a ratio of integers, got ${String(num)}/${String(den)}`);
  }
  if (den === 0) reject('a rational has no zero denominator');
  if (num < 0 || den < 0) reject(`a rational is never negative, got ${String(num)}/${String(den)}`);

  if (num === 0) return { num: 0, den: 1 };
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
};

export const add = (a: Rational, b: Rational): Rational =>
  rational(a.num * b.den + b.num * a.den, a.den * b.den);

/**
 * Total order. Returns a negative number, zero, or a positive number.
 *
 * Cross-multiplied rather than divided, so the comparison never touches a float.
 * Both denominators are positive by construction, which is what makes the sign of
 * the difference the sign of the comparison.
 *
 * Totality matters as much as correctness: comparisons feed ordered decisions, and
 * an order that fell back on representation or identity would be the iteration-order
 * determinism failure ADR 0001 names as the realistic one.
 */
export const compare = (a: Rational, b: Rational): number => a.num * b.den - b.num * a.den;

export const equals = (a: Rational, b: Rational): boolean => compare(a, b) === 0;

/** Whole units this value affords: floor(value). */
export const wholeSteps = (a: Rational): number => (a.num - (a.num % a.den)) / a.den;

/**
 * Subtract one whole unit. Precondition: the value is at least 1.
 *
 * SPEC §7 — an accumulator crossing 1 emits a head and keeps the overshoot.
 */
export const spendStep = (a: Rational): Rational => {
  // `num < den` is "value below 1" exactly, because the denominator is positive by
  // construction. Stated that way rather than via compare(a, ONE) so the guard does
  // not depend on a constant declared further down the file.
  if (a.num < a.den) reject(`cannot spend a whole unit from ${String(a.num)}/${String(a.den)}`);
  return rational(a.num - a.den, a.den);
};

/**
 * The fractional part — what an accumulator carries forward.
 *
 * SPEC §7 and §11 item 14: the remainder carries on spawn, and resets on capture.
 * The reset is P08's; this function only ever computes the carry.
 */
export const fractionalPart = (a: Rational): Rational => rational(a.num % a.den, a.den);

export const ZERO: Rational = { num: 0, den: 1 };
export const ONE: Rational = { num: 1, den: 1 };

/**
 * The maximum spawner force (SPEC §7). 1/3 is a very rare maximum.
 *
 * A documented ceiling, deliberately **not** a guard. SPEC §7 (*placement and
 * force are setup data*) forbids any rule from reading a force's value, and
 * every number in that section is playtest-first (§11 items 12 and 25) — so a
 * later packet that validates a force against this constant would turn a table
 * edit into a contract violation, which is exactly the friction the constraint
 * exists to prevent. Compare against it in a setup sanity check if you like;
 * never in the core.
 */
export const MAX_FORCE: Rational = { num: 1, den: 3 };
