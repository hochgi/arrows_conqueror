/**
 * The GeometryPort conformance suite, run against nothing.
 *
 * P01 defines the port and ships the suite; it does not implement a board.
 * Running the suite against a port whose every method throws is the honest red
 * for this packet — the behaviour is missing, and it is missing because P02
 * (fixture boards) and P03 (the generated tiling) have not been built.
 *
 * P03 replaces this file's factory with the generated tiling and the same suite
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
    seedPoint: () => missing('seedPoint'),
    window: () => missing('window'),
    inArrows: () => missing('inArrows'),
    outArrows: () => missing('outArrows'),
    origin: () => missing('origin'),
    target: () => missing('target'),
    flankVertices: () => missing('flankVertices'),
    borderArrows: () => missing('borderArrows'),
    slotOf: () => missing('slotOf'),
  };
};

// The skipped placeholder that used to live here is GONE, and that is progress.
//
// P01 shipped the suite without a board, so it was wrapped in a `describe.skip`
// — neither green nor red, but named in the report. P03 supplies the generated
// tiling, and `packages/geometry-tiling/test/conformance.test.ts` now runs the
// suite against it for real. Keeping the stand-in would duplicate all 37
// failures against a port that throws by design.
//
// The suite must go green *unchanged* over there. If it needs editing, the port
// leaked something concrete, and that is the finding rather than the fix.

describe('the conformance suite is P01’s actual deliverable', () => {
  it('is exported as a parameterized suite, not a fixed one', () => {
    // The thing P01 owes the repo is a suite any GeometryPort can be run
    // against. Two implementations (P02 fixtures, P03 generator) satisfying one
    // suite is the claim; taking a label and a factory is what makes it possible.
    expect(typeof runGeometryPortConformance).toBe('function');
    // label + factory are required; the options bag is optional and does not count.
    expect(runGeometryPortConformance).toHaveLength(2);
  });
});

describe('the port surface itself', () => {
  it('is exactly these nine methods', () => {
    // Pinned as an exact set rather than probed with a pattern. What matters is
    // what is ABSENT: no coordinate, no distance, no board dimensions, no
    // is-this-an-edge — and, since SPEC §11 item 4, no way to enumerate the
    // whole board either. The board is unbounded, so `window` is the only
    // enumerator and it must be asked for a bounded region explicitly.
    //
    // This assertion is green in phase 2 on purpose: it constrains the port's
    // shape, and the shape exists. Adding a method here should be a deliberate
    // act that fails this test first.
    expect(Object.keys(unimplementedPort()).toSorted()).toEqual([
      'borderArrows',
      'flankVertices',
      'inArrows',
      'origin',
      'outArrows',
      'seedPoint',
      'slotOf',
      'target',
      'window',
    ]);
  });
});
