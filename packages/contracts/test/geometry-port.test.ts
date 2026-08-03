/**
 * The GeometryPort conformance suite, run against nothing.
 *
 * P01 defines the port and ships the suite; it does not implement a board.
 * Running the suite against a port whose every method throws is the honest red
 * for this packet — the behaviour is missing, and it is missing because P02
 * (fixture boards) and P03 (the generated tiling) have not been built.
 *
 * P02 replaces this file's factory with a real fixture board and the same suite
 * goes green unchanged. That is the whole point of the split, and it is what
 * makes "any implementation satisfies the same tests" a fact rather than a
 * claim.
 */

import { describe, expect, it } from 'vitest';
import { runGeometryPortConformance } from '../src/testing/index';
import type { GeometryPort } from '../src/index';

const unimplementedPort = (): GeometryPort => {
  const missing = (method: string): never => {
    throw new Error(`no GeometryPort implementation yet: ${method} (P02/P03)`);
  };
  return {
    allPoints: () => missing('allPoints'),
    allArrows: () => missing('allArrows'),
    allVertices: () => missing('allVertices'),
    inArrows: () => missing('inArrows'),
    outArrows: () => missing('outArrows'),
    origin: () => missing('origin'),
    target: () => missing('target'),
    flankVertices: () => missing('flankVertices'),
    borderArrows: () => missing('borderArrows'),
    slotOf: () => missing('slotOf'),
  };
};

// PENDING UNTIL P02, DELIBERATELY.
//
// P01 ships the conformance suite; it does not ship a board, so there is nothing
// here for the suite to be true *about*. Left running it would leave `pnpm verify`
// red for the whole gap between P01 and P02 — and a permanently-failing verify is
// how people stop reading verify.
//
// Skipped is the honest state: neither green nor red, every test still named and
// enumerable in the report. P02 deletes this wrapper, points the factory at a
// fixture board, and the suite must go green *unchanged* — if it needs editing,
// the port leaked something concrete. That is in P02's definition of done.
describe.skip('awaiting a board implementation (P02)', () => {
  runGeometryPortConformance('no implementation (P01)', unimplementedPort);
});

describe('the conformance suite is P01’s actual deliverable', () => {
  it('is exported as a parameterized suite, not a fixed one', () => {
    // The thing P01 owes the repo is a suite any GeometryPort can be run
    // against. Two implementations (P02 fixtures, P03 generator) satisfying one
    // suite is the claim; taking a label and a factory is what makes it possible.
    expect(typeof runGeometryPortConformance).toBe('function');
    expect(runGeometryPortConformance).toHaveLength(2);
  });
});

describe('the port surface itself', () => {
  it('is exactly these ten methods', () => {
    // Pinned as an exact set rather than probed with a pattern. What matters is
    // what is ABSENT: no wrap, no seam, no board dimensions, no is-this-an-edge.
    // SPEC §2 makes the board a torus so that balance holds everywhere, and a
    // rule that could ask where the seam is would be a rule that could
    // special-case it. Decision D4 of the P01 packet.
    //
    // This assertion is green in phase 2 on purpose: it constrains the port's
    // shape, and the shape exists. Adding a method here should be a deliberate
    // act that fails this test first.
    expect(Object.keys(unimplementedPort()).toSorted()).toEqual([
      'allArrows',
      'allPoints',
      'allVertices',
      'borderArrows',
      'flankVertices',
      'inArrows',
      'origin',
      'outArrows',
      'slotOf',
      'target',
    ]);
  });
});
