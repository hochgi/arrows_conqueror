/**
 * The GeometryPort conformance suite.
 *
 * Any implementation must pass this unchanged — hand-authored fixture boards
 * (P02) and the generated tiling (P03) alike. That is what makes "a second
 * implementation of the port satisfies the same tests" a fact about the repo
 * rather than an aspiration.
 *
 * NOTHING HERE MAY NAME a lattice coordinate, a wrap, or a board size. If an
 * assertion needs one, it belongs in that implementation's own suite.
 *
 * This file is test code, not a skeleton: it is fully implemented, and it goes
 * red because no port exists yet.
 *
 * @see docs/spec/geometry-port/geometry-port.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation } from '../errors';
import type { GeometryPort } from '../geometry-port';
import { SLOTS, mintArrowId, mintPointId, mintVertexId } from '../ids';
import type { ArrowId, PointId, Slot, VertexId } from '../ids';

interface Cycle3 {
  readonly arrows: readonly [ArrowId, ArrowId, ArrowId];
  readonly points: readonly [PointId, PointId, PointId];
}

const findCycles3 = (g: GeometryPort): Cycle3[] => {
  const found: Cycle3[] = [];
  for (const a of g.allArrows()) {
    const p = g.origin(a);
    const q = g.target(a);
    for (const b of g.outArrows(q)) {
      const r = g.target(b);
      for (const c of g.outArrows(r)) {
        if (g.target(c) === p) found.push({ arrows: [a, b, c], points: [p, q, r] });
      }
    }
  }
  return found;
};

const reachForward = (g: GeometryPort, from: PointId): Set<PointId> => {
  const seen = new Set<PointId>([from]);
  const queue: PointId[] = [from];
  while (queue.length > 0) {
    const p = queue.pop() as PointId;
    for (const a of g.outArrows(p)) {
      const t = g.target(a);
      if (!seen.has(t)) {
        seen.add(t);
        queue.push(t);
      }
    }
  }
  return seen;
};

const reachBackward = (g: GeometryPort, from: PointId): Set<PointId> => {
  const seen = new Set<PointId>([from]);
  const queue: PointId[] = [from];
  while (queue.length > 0) {
    const p = queue.pop() as PointId;
    for (const a of g.inArrows(p)) {
      const o = g.origin(a);
      if (!seen.has(o)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return seen;
};

const intersect = <T>(sets: readonly (readonly T[])[]): T[] => {
  const [first, ...rest] = sets;
  if (first === undefined) return [];
  return first.filter((x) => rest.every((s) => s.includes(x)));
};

/**
 * Run the suite against a port factory.
 *
 * @param label how this board should appear in test output
 * @param makePort constructs a fresh port; called more than once, and two calls
 *   must produce boards that agree exactly
 */
export const runGeometryPortConformance = (
  label: string,
  makePort: () => GeometryPort,
): void => {
  describe(`GeometryPort conformance — ${label}`, () => {
    describe('points are 3-in / 3-out', () => {
      it('gives every point exactly three in-arrows and three out-arrows', () => {
        const g = makePort();
        for (const p of g.allPoints()) {
          expect(g.inArrows(p)).toHaveLength(3);
          expect(g.outArrows(p)).toHaveLength(3);
        }
      });

      it('agrees with arrow endpoints', () => {
        const g = makePort();
        for (const a of g.allArrows()) {
          expect(g.outArrows(g.origin(a))).toContain(a);
          expect(g.inArrows(g.target(a))).toContain(a);
        }
      });

      it("keeps a point's six arrow slots distinct", () => {
        const g = makePort();
        for (const p of g.allPoints()) {
          const six = [...g.inArrows(p), ...g.outArrows(p)];
          expect(new Set(six).size).toBe(6);
        }
      });
    });

    describe('every arrow flanks exactly two spawner vertices', () => {
      it('gives every vertex exactly three bordering arrows', () => {
        const g = makePort();
        for (const v of g.allVertices()) {
          expect(g.borderArrows(v)).toHaveLength(3);
        }
      });

      it('gives every arrow exactly two distinct flank vertices', () => {
        const g = makePort();
        for (const a of g.allArrows()) {
          const flanks = g.flankVertices(a);
          expect(flanks).toHaveLength(2);
          expect(new Set(flanks).size).toBe(2);
        }
      });

      it('keeps flank and border mutually inverse', () => {
        const g = makePort();
        for (const a of g.allArrows()) {
          for (const v of g.flankVertices(a)) {
            expect(g.borderArrows(v)).toContain(a);
          }
        }
        for (const v of g.allVertices()) {
          for (const a of g.borderArrows(v)) {
            expect(g.flankVertices(a)).toContain(v);
          }
        }
      });
    });

    describe('the incidence counts close at 3:1:2', () => {
      it('stands arrows, points and vertices in a 3:1:2 ratio', () => {
        const g = makePort();
        const points = g.allPoints().length;
        expect(g.allArrows()).toHaveLength(3 * points);
        expect(g.allVertices()).toHaveLength(2 * points);
      });
    });

    describe('strongly connected, girth 3', () => {
      it('lets every point reach every other point', () => {
        const g = makePort();
        const points = g.allPoints();
        const [seed] = points;
        expect(seed).toBeDefined();
        // Forward from the seed covers all, and backward from the seed covers
        // all, so every point reaches the seed and the seed reaches every
        // point. That is strong connectivity, in two sweeps rather than n.
        expect(reachForward(g, seed as PointId).size).toBe(points.length);
        expect(reachBackward(g, seed as PointId).size).toBe(points.length);
      });

      it('has no cycle shorter than three', () => {
        const g = makePort();
        for (const a of g.allArrows()) {
          expect(g.origin(a)).not.toBe(g.target(a));
        }
        for (const a of g.allArrows()) {
          for (const b of g.outArrows(g.target(a))) {
            expect(g.target(b)).not.toBe(g.origin(a));
          }
        }
      });

      it('has at least one cycle of length three', () => {
        const g = makePort();
        expect(findCycles3(g).length).toBeGreaterThan(0);
      });

      it('encloses exactly one vertex in every minimal cycle', () => {
        const g = makePort();
        for (const cycle of findCycles3(g)) {
          const shared = intersect(cycle.arrows.map((a) => [...g.flankVertices(a)]));
          expect(shared).toHaveLength(1);
        }
      });

      it('gives each vertex at most one minimal cycle', () => {
        const g = makePort();
        const claimed = new Map<VertexId, number>();
        for (const cycle of findCycles3(g)) {
          const [v] = intersect(cycle.arrows.map((a) => [...g.flankVertices(a)]));
          if (v !== undefined) claimed.set(v, (claimed.get(v) ?? 0) + 1);
        }
        for (const count of claimed.values()) {
          expect(count).toBe(1);
        }
      });
    });

    describe('there is no rim', () => {
      it('makes every point indistinguishable from every other by degree', () => {
        const g = makePort();
        const degrees = g
          .allPoints()
          .map((p) => `${String(g.inArrows(p).length)}/${String(g.outArrows(p).length)}`);
        expect(new Set(degrees)).toEqual(new Set(['3/3']));
      });

      it('runs no two arrows between the same ordered pair of points', () => {
        const g = makePort();
        const seen = new Set<string>();
        for (const a of g.allArrows()) {
          const key = `${String(g.origin(a))}->${String(g.target(a))}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      });

      it('has no arrow whose origin and target are the same point', () => {
        // A self-loop would make girth 1 and would let a head "advance" without
        // going anywhere, which the movement rules have no concept of.
        const g = makePort();
        for (const a of g.allArrows()) {
          expect(g.origin(a)).not.toBe(g.target(a));
        }
      });
    });

    describe('identifiers from another board are rejected', () => {
      // Fixture boards (P02) and a generated tiling (P03) coexist in one test
      // run. An id minted against one must never silently resolve against the
      // other — a plausible-looking wrong answer here is an adjacency bug that
      // surfaces turns later as a replay mismatch.
      const foreign = {
        arrow: mintArrowId('foreign-board:arrow'),
        point: mintPointId('foreign-board:point'),
        vertex: mintVertexId('foreign-board:vertex'),
      };

      it.each([
        { query: 'out-arrows', run: (g: GeometryPort) => g.outArrows(foreign.point) },
        { query: 'in-arrows', run: (g: GeometryPort) => g.inArrows(foreign.point) },
        { query: 'origin', run: (g: GeometryPort) => g.origin(foreign.arrow) },
        { query: 'target', run: (g: GeometryPort) => g.target(foreign.arrow) },
        { query: 'flank-vertices', run: (g: GeometryPort) => g.flankVertices(foreign.arrow) },
        { query: 'border-arrows', run: (g: GeometryPort) => g.borderArrows(foreign.vertex) },
      ])('fails loudly when $query is given a foreign identifier', ({ run }) => {
        const g = makePort();
        expect(() => run(g)).toThrow(ContractViolation);
      });
    });

    describe('enumeration is total and duplicate-free', () => {
      it('yields each point, arrow and vertex exactly once', () => {
        const g = makePort();
        expect(new Set(g.allPoints()).size).toBe(g.allPoints().length);
        expect(new Set(g.allArrows()).size).toBe(g.allArrows().length);
        expect(new Set(g.allVertices()).size).toBe(g.allVertices().length);
      });

      it('enumerates every element any adjacency query names', () => {
        const g = makePort();
        const points = new Set<PointId>(g.allPoints());
        const arrows = new Set<ArrowId>(g.allArrows());
        const vertices = new Set<VertexId>(g.allVertices());
        for (const p of points) {
          for (const a of [...g.inArrows(p), ...g.outArrows(p)]) {
            expect(arrows.has(a)).toBe(true);
          }
        }
        for (const a of arrows) {
          expect(points.has(g.origin(a))).toBe(true);
          expect(points.has(g.target(a))).toBe(true);
          for (const v of g.flankVertices(a)) expect(vertices.has(v)).toBe(true);
        }
        for (const v of vertices) {
          for (const a of g.borderArrows(v)) expect(arrows.has(a)).toBe(true);
        }
      });
    });

    describe('queries are order-stable', () => {
      it('returns identical sequences from repeated adjacency queries', () => {
        const g = makePort();
        for (const p of g.allPoints()) {
          expect(g.outArrows(p)).toEqual(g.outArrows(p));
          expect(g.inArrows(p)).toEqual(g.inArrows(p));
        }
      });

      it('does not let query history change adjacency order', () => {
        const a = makePort();
        const b = makePort();
        const points = a.allPoints();
        const [target] = points;
        expect(target).toBeDefined();
        const cold = b.outArrows(target as PointId);
        for (const p of points) a.outArrows(p);
        expect(a.outArrows(target as PointId)).toEqual(cold);
      });

      it('makes two ports from the same description agree exactly', () => {
        const a = makePort();
        const b = makePort();
        expect(a.allPoints()).toEqual(b.allPoints());
        expect(a.allArrows()).toEqual(b.allArrows());
        expect(a.allVertices()).toEqual(b.allVertices());
      });
    });

    describe('slots', () => {
      it("assigns each of a point's six arrows a distinct slot", () => {
        const g = makePort();
        for (const p of g.allPoints()) {
          const six = [...g.inArrows(p), ...g.outArrows(p)];
          const slots = six.map((a) => g.slotOf(p, a));
          expect(new Set(slots).size).toBe(6);
        }
      });

      it('alternates in-arrows and out-arrows around every point', () => {
        // SPEC §2 and §11 item 29. Not cosmetic: "both handednesses available"
        // is what §5 and §6 assume when a head turns aside from a trail without
        // crossing it, and those scenarios are tested on fixture boards. A
        // chiral board answers them differently.
        //
        // The PHASE is deliberately free — in-arrows may hold the even slots or
        // the odd ones. Slot indices are the port's own labelling and the chord
        // test is rotation-invariant, so pinning it would only create a fact for
        // a caller to depend on.
        const g = makePort();
        for (const p of g.allPoints()) {
          const isIn = new Map<Slot, boolean>();
          for (const a of g.inArrows(p)) isIn.set(g.slotOf(p, a), true);
          for (const a of g.outArrows(p)) isIn.set(g.slotOf(p, a), false);
          for (const s of SLOTS) {
            const next = ((s + 1) % SLOTS.length) as Slot;
            expect(isIn.get(s)).not.toBe(isIn.get(next));
          }
        }
      });
    });
  });
};
