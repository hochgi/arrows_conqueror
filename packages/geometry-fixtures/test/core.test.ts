/**
 * One test per scenario in fixtures.core.feature (minus the two conformance
 * scenarios, which live in conformance.test.ts).
 *
 * Everything is observed **through the port**: a test names no id it did not get
 * back from the port, and asserts on what the port returns, never on an id's
 * string. The window is grown at each board's diameter, so it is the whole
 * board — which is what lets a finite fixture answer "every arrow" and "every
 * vertex" at all.
 *
 * @see docs/spec/fixtures/fixtures.core.feature
 */

import { describe, expect, it } from 'vitest';
import type { ArrowId, BoardWindow, GeometryPort, PointId, VertexId } from '@arrows/contracts';
import { makeFixture } from '../src/index';
import { BOARDS } from './support';
import type { BoardCase } from './support';

/** Every minimal directed 3-cycle touching a point of `points`, deduplicated by a canonical key. */
const minimalCycles = (g: GeometryPort, points: readonly PointId[]): (readonly ArrowId[])[] => {
  const found = new Map<string, readonly ArrowId[]>();
  for (const p of points) {
    for (const a of g.outArrows(p)) {
      for (const b of g.outArrows(g.target(a))) {
        for (const c of g.outArrows(g.target(b))) {
          if (g.target(c) === p) found.set([a, b, c].toSorted().join('|'), [a, b, c]);
        }
      }
    }
  }
  return [...found.values()];
};

/** The vertices flanked by *all three* arrows of a cycle — its enclosed spawner(s). */
const commonFlank = (g: GeometryPort, cycle: readonly ArrowId[]): VertexId[] => {
  const sets = cycle.map((a) => new Set<VertexId>(g.flankVertices(a)));
  const [first, ...rest] = sets;
  if (first === undefined) return [];
  return [...first].filter((v) => rest.every((s) => s.has(v)));
};

const wholeBoard = (g: GeometryPort, board: BoardCase): BoardWindow =>
  g.window(g.seedPoint(), board.diameter);

describe.each(BOARDS)('$label — the vertex lattice is derived, not authored', (board) => {
  it('yields exactly one derived vertex per minimal cycle, and no vertex from anything else', () => {
    // fixtures.core.feature: "Each minimal cycle yields exactly one vertex".
    const g = makeFixture(board.description);
    const w = wholeBoard(g, board);
    const cycles = minimalCycles(g, w.points);

    const claimed: VertexId[] = [];
    for (const cycle of cycles) {
      const enclosed = commonFlank(g, cycle);
      expect(enclosed).toHaveLength(1);
      claimed.push(enclosed[0] as VertexId);
    }
    // A bijection cycle <-> vertex: every derived vertex comes from a cycle
    // (claimed set equals the board's vertices) and no two cycles share one.
    expect(new Set(claimed).size).toBe(cycles.length);
    expect(new Set(claimed)).toEqual(new Set(w.vertices));
  });

  it('flanks every arrow with exactly two distinct derived vertices', () => {
    // fixtures.core.feature: "Every arrow flanks exactly two derived vertices".
    const g = makeFixture(board.description);
    for (const a of wholeBoard(g, board).arrows) {
      const flanks = g.flankVertices(a);
      expect(flanks).toHaveLength(2);
      expect(new Set(flanks).size).toBe(2);
    }
  });

  it('keeps flank and border mutually inverse over derived vertices', () => {
    // fixtures.core.feature: "Flank and border are mutually inverse over derived vertices".
    const g = makeFixture(board.description);
    const w = wholeBoard(g, board);
    for (const a of w.arrows) {
      for (const v of g.flankVertices(a)) expect(g.borderArrows(v)).toContain(a);
    }
    for (const v of w.vertices) {
      for (const a of g.borderArrows(v)) expect(g.flankVertices(a)).toContain(v);
    }
  });
});

describe.each(BOARDS)('$label — a finite board is its own window', (board) => {
  it('yields the whole board once the radius reaches the diameter', () => {
    // fixtures.core.feature: "A radius at least the diameter yields the whole board".
    // The counts follow the 3 : 1 : 2 incidence, so "every arrow and every
    // vertex of the board" is exactly 3 x size arrows and 2 x size vertices.
    const g = makeFixture(board.description);
    const w = g.window(g.seedPoint(), board.diameter);
    expect(w.points).toHaveLength(board.size);
    expect(w.points).toContain(g.seedPoint());
    expect(w.arrows).toHaveLength(3 * board.size);
    expect(w.vertices).toHaveLength(2 * board.size);
  });

  it('does not change once the radius passes the diameter', () => {
    // fixtures.core.feature: "Growing past the diameter changes nothing".
    const g = makeFixture(board.description);
    const seed = g.seedPoint();
    const atDiameter = g.window(seed, board.diameter).points;
    const beyond = g.window(seed, board.diameter + 1).points;
    expect(new Set(beyond)).toEqual(new Set(atDiameter));
  });
});

describe.each(BOARDS)('$label — two builds of the same board agree exactly', (board) => {
  it('returns identical windows and mints identical derived-vertex ids', () => {
    // fixtures.core.feature: "Two ports from the same description are identical".
    // This must catch an insertion-order leak (ADR 0001, P02 D5), so it compares
    // ids from two INDEPENDENT builds — not two shapes from one build.
    const a = makeFixture(board.description);
    const b = makeFixture(board.description);

    expect(a.seedPoint()).toEqual(b.seedPoint());

    const winA = a.window(a.seedPoint(), board.diameter);
    const winB = b.window(b.seedPoint(), board.diameter);
    // Content AND order, so a Map-insertion-order drift shows up here.
    expect(winB).toEqual(winA);
    // Made explicit: the same derived vertex carries the same id across builds.
    expect(winB.vertices).toEqual(winA.vertices);
  });
});
