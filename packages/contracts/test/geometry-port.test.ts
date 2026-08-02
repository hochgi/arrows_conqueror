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

runGeometryPortConformance('no implementation (P01)', unimplementedPort);

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
