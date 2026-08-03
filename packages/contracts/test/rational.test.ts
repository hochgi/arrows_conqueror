/**
 * One test per scenario in:
 *   docs/spec/rational/rational.core.feature
 *   docs/spec/rational/rational.edge-cases.feature
 *
 * Exactness is a product property. Five additions of 7/36 fall short of 1 and
 * six overshoot it — an implementation carrying an epsilon lands on the wrong
 * side of that boundary, spawning a head a turn early or late, and then every
 * subsequent carry is wrong too.
 */

import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  ContractViolation,
  equals,
  fractionalPart,
  harmonicAllowance,
  MAX_FORCE,
  rational,
  spendStep,
  wholeSteps,
} from '../src/index';
import type { Rational } from '../src/index';

const is = (r: Rational, num: number, den: number): void => {
  expect({ num: r.num, den: r.den }).toEqual({ num, den });
};

describe('rational — addition is exact across coprime denominators', () => {
  it('adds a double-fed arrow exactly', () => {
    is(add(rational(1, 9), rational(1, 12)), 7, 36);
  });

  it('does not drift under repeated addition', () => {
    const seventhirtysixth = rational(7, 36);
    let acc = rational(0, 1);
    for (let i = 0; i < 6; i += 1) acc = add(acc, seventhirtysixth);
    is(acc, 7, 6);
  });

  it.each([
    { heads: 1, num: 1, den: 1 },
    { heads: 2, num: 3, den: 2 },
    { heads: 3, num: 11, den: 6 },
    { heads: 4, num: 25, den: 12 },
  ])('computes harmonic allowance for $heads heads exactly', ({ heads, num, den }) => {
    is(harmonicAllowance(heads), num, den);
  });
});

describe('rational — normalized and compared by value', () => {
  it.each([
    { left: [2, 4], right: [1, 2] },
    { left: [6, 9], right: [2, 3] },
    { left: [0, 5], right: [0, 1] },
    { left: [4, 2], right: [2, 1] },
  ])('compares $left equal to $right', ({ left, right }) => {
    const a = rational(left[0] as number, left[1] as number);
    const b = rational(right[0] as number, right[1] as number);
    expect(equals(a, b)).toBe(true);
    expect(compare(a, b)).toBe(0);
  });

  it('orders totally', () => {
    const values = [rational(1, 3), rational(1, 12), rational(7, 36), rational(1, 9)];
    const sorted = [...values].sort(compare);
    expect(sorted.map((r) => [r.num, r.den])).toEqual([
      [1, 12],
      [1, 9],
      [7, 36],
      [1, 3],
    ]);
  });

  it('sorts identically regardless of input order', () => {
    const values = [rational(1, 3), rational(1, 12), rational(7, 36), rational(1, 9)];
    const forward = [...values].sort(compare).map((r) => [r.num, r.den]);
    const backward = [...values].reverse().sort(compare).map((r) => [r.num, r.den]);
    expect(forward).toEqual(backward);
  });
});

describe('rational — banking and carry keep the remainder', () => {
  it('spends a whole step and keeps the fraction', () => {
    is(spendStep(rational(3, 2)), 1, 2);
  });

  it('carries the overshoot when an accumulator passes one', () => {
    const after = add(rational(11, 12), rational(1, 4));
    expect(wholeSteps(after)).toBe(1);
    is(fractionalPart(after), 1, 6);
  });

  it('carries nothing when an accumulator lands exactly on one', () => {
    const after = add(rational(2, 3), rational(1, 3));
    expect(wholeSteps(after)).toBe(1);
    is(fractionalPart(after), 0, 1);
  });
});

describe('rational — a tick can never produce two heads', () => {
  it('produces one head from the largest gain onto the largest holding', () => {
    // An accumulator is below 1 before a tick, and the largest possible gain is
    // two maximum-force spawners landing together: 1/3 + 1/3 = 2/3. So the
    // post-tick value is always below 5/3.
    const after = add(add(rational(11, 12), rational(1, 3)), rational(1, 3));
    expect(wholeSteps(after)).toBe(1);
    is(fractionalPart(after), 7, 12);
  });
});

describe('rational — zero, whole numbers and rejection', () => {
  it.each([
    [0, 1],
    [0, 7],
    [0, 36],
  ])('compares %i/%i equal to zero', (num, den) => {
    expect(equals(rational(num, den), rational(0, 1))).toBe(true);
  });

  it('leaves no bank when a whole allowance is spent', () => {
    is(spendStep(rational(1, 1)), 0, 1);
  });

  it('affords no step below one', () => {
    expect(wholeSteps(rational(5, 6))).toBe(0);
  });

  // These assert ContractViolation rather than any throw. A bare `.toThrow()`
  // would pass against the phase-2 skeleton, which throws `not implemented`,
  // and would go on passing in phase 3 whether or not the check was written.
  it('rejects a negative value', () => {
    expect(() => rational(-1, 2)).toThrow(ContractViolation);
  });

  it('rejects a zero denominator', () => {
    expect(() => rational(1, 0)).toThrow(ContractViolation);
  });

  it('exposes the maximum force as a comparable ceiling', () => {
    // SPEC §7: a spawner's force is a fraction ≤ 1/3. P01 owns the constant and
    // the ordering that makes it checkable; *rejecting* an over-forced spawner
    // is P08's, because a Rational has no idea what a spawner is and teaching
    // it would put economy rules inside a numeric DTO.
    expect(equals(MAX_FORCE, rational(1, 3))).toBe(true);
    expect(compare(rational(1, 2), MAX_FORCE)).toBeGreaterThan(0);
    expect(compare(rational(1, 9), MAX_FORCE)).toBeLessThan(0);
    expect(compare(MAX_FORCE, MAX_FORCE)).toBe(0);
  });
});

describe('rational — denominators stay bounded and operands are not mutated', () => {
  it('keeps repeated accrual in lowest terms', () => {
    let acc = rational(0, 1);
    for (let i = 0; i < 200; i += 1) {
      acc = add(acc, i % 2 === 0 ? rational(1, 9) : rational(1, 12));
      if (wholeSteps(acc) > 0) acc = fractionalPart(acc);
      expect(acc.den).toBeLessThanOrEqual(36);
    }
  });

  it('leaves both operands unchanged after addition', () => {
    const a = rational(1, 9);
    const b = rational(1, 12);
    add(a, b);
    is(a, 1, 9);
    is(b, 1, 12);
  });
});
