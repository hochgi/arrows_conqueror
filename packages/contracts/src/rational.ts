/**
 * Exact rational arithmetic.
 *
 * SPEC §3 (harmonic allowance, banked movement) and §7 (spawner accrual).
 * ADR 0001 — never floating point.
 *
 * Exactness is a product property, not a preference. Coprime denominators over
 * a round-robin are what produce "deterministic irregularity": a rhythm complex
 * enough to feel organic while staying computable by an attentive player. Five
 * additions of 7/36 fall short of 1 and six overshoot it — an implementation
 * carrying an epsilon lands on the wrong side of that boundary, and then every
 * subsequent carry is wrong too.
 *
 * SKELETON — phase 2. Every function throws. Phase 3 implements them.
 */

const notImplemented = (what: string): never => {
  throw new Error(`not implemented: ${what}`);
};

/** Always normalized to lowest terms, with a positive denominator. */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

/**
 * Construct a rational in lowest terms.
 *
 * Throws {@link ContractViolation} on a zero denominator or any negative value:
 * neither allowance nor accrual is ever negative, and an unsigned type makes an
 * underflow bug unrepresentable rather than merely detectable.
 */
export const rational = (_num: number, _den: number): Rational =>
  notImplemented('rational');

export const add = (_a: Rational, _b: Rational): Rational => notImplemented('add');

/** Total order. Returns a negative number, zero, or a positive number. */
export const compare = (_a: Rational, _b: Rational): number => notImplemented('compare');

export const equals = (_a: Rational, _b: Rational): boolean => notImplemented('equals');

/** Whole steps this value affords: floor(value). */
export const wholeSteps = (_a: Rational): number => notImplemented('wholeSteps');

/**
 * Subtract one whole step. Precondition: the value is at least 1.
 *
 * SPEC §3 — spending a step reduces an allowance by exactly 1, leaving the
 * fraction intact.
 */
export const spendStep = (_a: Rational): Rational => notImplemented('spendStep');

/**
 * The fractional part.
 *
 * SPEC §3 and §11 item 20: only the sub-step remainder carries between turns.
 * Whole unspent steps are forfeited — otherwise a rearguard sentry becomes a
 * spring, skipping three turns to move four, which would undercut the point
 * that standing still is doing its job.
 */
export const fractionalPart = (_a: Rational): Rational =>
  notImplemented('fractionalPart');

/**
 * Harmonic movement allowance: `speed(n) = 1 + 1/2 + ... + 1/n`.
 *
 * SPEC §3. Sub-linear by design — stacking must never beat splitting on raw
 * throughput.
 */
export const harmonicAllowance = (_heads: number): Rational =>
  notImplemented('harmonicAllowance');

export const ZERO: Rational = { num: 0, den: 1 };
export const ONE: Rational = { num: 1, den: 1 };

/** The maximum spawner force (SPEC §7). 1/3 is a very rare maximum. */
export const MAX_FORCE: Rational = { num: 1, den: 3 };
