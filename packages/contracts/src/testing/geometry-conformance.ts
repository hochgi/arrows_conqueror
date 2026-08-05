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
 * **Everything is asserted over a window** (SPEC §11 item 4). The board is
 * unbounded, so there is no "every point" to quantify over; a window is a
 * graph-distance ball, which means the same thing on a generated lattice and on
 * an abstract fixture digraph. Two consequences shape the assertions below:
 *
 * - Every property asserted is **local** — true of a point and its
 *   neighbourhood — so a window is a fair sample rather than a compromise.
 * - The two global counts the old suite made (`3:1:2`, strong connectivity) are
 *   restated locally. See `the incidence counts close at 3:1:2` for why "every
 *   point lies on exactly 6 minimal cycles" is the same claim.
 *
 * This file is test code, not a skeleton: it is fully implemented, and it goes
 * red because no port exists yet.
 *
 * @see docs/spec/geometry-port/geometry-port.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation } from '../errors';
import type { BoardWindow, GeometryPort } from '../geometry-port';
import { SLOTS, mintArrowId, mintPointId, mintVertexId } from '../ids';
import type { ArrowId, PointId, Slot, VertexId } from '../ids';

/**
 * A minimal directed cycle, keyed canonically.
 *
 * The key is what stops triple-counting: a 3-cycle is discovered once per arrow
 * it starts from, so the three rotations of one triangle are the same cycle and
 * must collapse to one entry. An earlier version of this suite counted the
 * rotations separately, which would have made *every* vertex look like it owned
 * three minimal cycles — an assertion that could never pass, and did not fail
 * only because the suite was pending.
 */
const cycleKey = (arrows: readonly ArrowId[]): string => [...arrows].sort().join('|');

/** Every minimal directed cycle through `p`, found via adjacency alone. */
const cycles3Through = (g: GeometryPort, p: PointId): Map<string, readonly ArrowId[]> => {
  const found = new Map<string, readonly ArrowId[]>();
  for (const a of g.outArrows(p)) {
    for (const b of g.outArrows(g.target(a))) {
      for (const c of g.outArrows(g.target(b))) {
        if (g.target(c) === p) found.set(cycleKey([a, b, c]), [a, b, c]);
      }
    }
  }
  return found;
};

/** Every minimal directed cycle touching any point of the window, deduplicated. */
const cycles3In = (g: GeometryPort, w: BoardWindow): (readonly ArrowId[])[] => {
  const found = new Map<string, readonly ArrowId[]>();
  for (const p of w.points) {
    for (const [key, arrows] of cycles3Through(g, p)) found.set(key, arrows);
  }
  return [...found.values()];
};

/**
 * Directed reachability, confined to a set of points so it terminates on an
 * unbounded board.
 */
const reach = (
  g: GeometryPort,
  from: PointId,
  confine: ReadonlySet<PointId>,
  step: (p: PointId) => readonly PointId[],
): Set<PointId> => {
  const seen = new Set<PointId>([from]);
  const queue: PointId[] = [from];
  while (queue.length > 0) {
    const p = queue.pop() as PointId;
    for (const q of step(p)) {
      if (confine.has(q) && !seen.has(q)) {
        seen.add(q);
        queue.push(q);
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
 * How far past the asserted window the connectivity search may roam.
 *
 * Girth is 3, so a U-turn costs three moves and a detour never needs much room.
 * On the generated lattice zero slack suffices — a ball is already strongly
 * connected on its own — and the margin is here for fixture boards, whose shape
 * is authored rather than regular.
 */
const REACH_SLACK = 2;

export interface ConformanceOptions {
  /**
   * Radius of the window every assertion is made over.
   *
   * An implementation picks a radius that makes the window meaningful: a finite
   * fixture board wants one at least its own diameter, so the window *is* the
   * board; a generated lattice wants one big enough to be a fair sample and
   * small enough to stay fast.
   */
  readonly radius?: number;
}

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
  options: ConformanceOptions = {},
): void => {
  const radius = options.radius ?? 4;
  const win = (g: GeometryPort): BoardWindow => g.window(g.seedPoint(), radius);

  describe(`GeometryPort conformance — ${label}`, () => {
    describe('points are 3-in / 3-out', () => {
      it('gives every point exactly three in-arrows and three out-arrows', () => {
        const g = makePort();
        for (const p of win(g).points) {
          expect(g.inArrows(p)).toHaveLength(3);
          expect(g.outArrows(p)).toHaveLength(3);
        }
      });

      it('agrees with arrow endpoints', () => {
        const g = makePort();
        for (const a of win(g).arrows) {
          expect(g.outArrows(g.origin(a))).toContain(a);
          expect(g.inArrows(g.target(a))).toContain(a);
        }
      });

      it("keeps a point's six arrow slots distinct", () => {
        const g = makePort();
        for (const p of win(g).points) {
          const six = [...g.inArrows(p), ...g.outArrows(p)];
          expect(new Set(six).size).toBe(6);
        }
      });
    });

    describe('every arrow flanks exactly two spawner vertices', () => {
      it('gives every vertex exactly three bordering arrows', () => {
        const g = makePort();
        for (const v of win(g).vertices) {
          expect(g.borderArrows(v)).toHaveLength(3);
        }
      });

      it('gives every arrow exactly two distinct flank vertices', () => {
        const g = makePort();
        for (const a of win(g).arrows) {
          const flanks = g.flankVertices(a);
          expect(flanks).toHaveLength(2);
          expect(new Set(flanks).size).toBe(2);
        }
      });

      it('keeps flank and border mutually inverse', () => {
        const g = makePort();
        const w = win(g);
        for (const a of w.arrows) {
          for (const v of g.flankVertices(a)) {
            expect(g.borderArrows(v)).toContain(a);
          }
        }
        for (const v of w.vertices) {
          for (const a of g.borderArrows(v)) {
            expect(g.flankVertices(a)).toContain(v);
          }
        }
      });
    });

    describe('the incidence counts close at 3:1:2', () => {
      // Restated locally, because an unbounded board has no totals to compare.
      // Both halves are exact rather than asymptotic:
      //
      //   3:1  every point owns its 3 out-arrows and no other point does, so
      //        counting arrows *by origin* is boundary-free.
      //   2:1  every point lies on exactly 6 minimal cycles and every cycle has
      //        3 points, so cycles = 2 x points; the two assertions below it
      //        make cycles and vertices a bijection, giving vertices = 2 x
      //        points without ever counting either.
      it('gives every point exactly three arrows of its own', () => {
        const g = makePort();
        const w = win(g);
        const points = new Set(w.points);
        const owned = w.arrows.filter((a) => points.has(g.origin(a)));
        expect(owned).toHaveLength(3 * w.points.length);
      });

      it('puts every point on exactly six minimal cycles', () => {
        const g = makePort();
        for (const p of win(g).points) {
          expect(cycles3Through(g, p).size).toBe(6);
        }
      });
    });

    describe('strongly connected, girth 3', () => {
      it('lets every point reach every other point', () => {
        const g = makePort();
        const inner = win(g).points;
        const seed = g.seedPoint();
        const confine = new Set(g.window(seed, radius + REACH_SLACK).points);
        // Forward from the seed covers the window, and backward from the seed
        // covers it too, so every point reaches the seed and the seed reaches
        // every point. That is strong connectivity, in two sweeps rather than n.
        const forward = reach(g, seed, confine, (p) => g.outArrows(p).map((a) => g.target(a)));
        const backward = reach(g, seed, confine, (p) => g.inArrows(p).map((a) => g.origin(a)));
        for (const p of inner) {
          expect(forward.has(p)).toBe(true);
          expect(backward.has(p)).toBe(true);
        }
      });

      it('has no cycle shorter than three', () => {
        const g = makePort();
        for (const a of win(g).arrows) {
          expect(g.origin(a)).not.toBe(g.target(a));
          for (const b of g.outArrows(g.target(a))) {
            expect(g.target(b)).not.toBe(g.origin(a));
          }
        }
      });

      it('has at least one cycle of length three', () => {
        const g = makePort();
        expect(cycles3In(g, win(g)).length).toBeGreaterThan(0);
      });

      it('encloses exactly one vertex in every minimal cycle', () => {
        const g = makePort();
        for (const arrows of cycles3In(g, win(g))) {
          const shared = intersect(arrows.map((a) => [...g.flankVertices(a)]));
          expect(shared).toHaveLength(1);
        }
      });

      it('gives each vertex exactly one minimal cycle', () => {
        const g = makePort();
        const claimed = new Map<VertexId, number>();
        for (const arrows of cycles3In(g, win(g))) {
          const [v] = intersect(arrows.map((a) => [...g.flankVertices(a)]));
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
        const degrees = win(g).points.map(
          (p) => `${String(g.inArrows(p).length)}/${String(g.outArrows(p).length)}`,
        );
        expect(new Set(degrees)).toEqual(new Set(['3/3']));
      });

      it('runs no two arrows between the same ordered pair of points', () => {
        const g = makePort();
        const seen = new Set<string>();
        for (const a of win(g).arrows) {
          const key = `${String(g.origin(a))}->${String(g.target(a))}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      });

      it('has no arrow whose origin and target are the same point', () => {
        // A self-loop would make girth 1 and would let a head "advance" without
        // going anywhere, which the movement rules have no concept of.
        const g = makePort();
        for (const a of win(g).arrows) {
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
        { query: 'window', run: (g: GeometryPort) => g.window(foreign.point, 1) },
      ])('fails loudly when $query is given a foreign identifier', ({ run }) => {
        const g = makePort();
        expect(() => run(g)).toThrow(ContractViolation);
      });
    });

    describe('a window is a well-formed ball', () => {
      it('reports back the centre and radius it was asked for', () => {
        const g = makePort();
        const seed = g.seedPoint();
        const w = g.window(seed, radius);
        expect(w.centre).toBe(seed);
        expect(w.radius).toBe(radius);
        expect(w.points).toContain(seed);
      });

      it('yields just the centre at radius zero', () => {
        const g = makePort();
        const seed = g.seedPoint();
        expect(g.window(seed, 0).points).toEqual([seed]);
      });

      it('grows monotonically with radius', () => {
        const g = makePort();
        const seed = g.seedPoint();
        const small = new Set(g.window(seed, radius).points);
        for (const p of small) expect(g.window(seed, radius + 1).points).toContain(p);
      });

      it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'refuses a radius of %s',
        (bad) => {
          const g = makePort();
          expect(() => g.window(g.seedPoint(), bad)).toThrow(ContractViolation);
        },
      );

      it('yields each point, arrow and vertex exactly once', () => {
        const g = makePort();
        const w = win(g);
        expect(new Set(w.points).size).toBe(w.points.length);
        expect(new Set(w.arrows).size).toBe(w.arrows.length);
        expect(new Set(w.vertices).size).toBe(w.vertices.length);
      });

      it('is closed under the incidence a caller follows', () => {
        // Inclusive at the fringe, in one direction only: a point's arrows are
        // all present and an arrow's flanks are all present. The converse is
        // deliberately NOT asserted — a fringe arrow may point out of the
        // window, which is what makes it a window rather than a board.
        const g = makePort();
        const w = win(g);
        const arrows = new Set<ArrowId>(w.arrows);
        const vertices = new Set<VertexId>(w.vertices);
        for (const p of w.points) {
          for (const a of [...g.inArrows(p), ...g.outArrows(p)]) {
            expect(arrows.has(a)).toBe(true);
          }
        }
        for (const a of w.arrows) {
          for (const v of g.flankVertices(a)) expect(vertices.has(v)).toBe(true);
        }
      });
    });

    describe('queries are order-stable', () => {
      it('returns identical sequences from repeated adjacency queries', () => {
        const g = makePort();
        for (const p of win(g).points) {
          expect(g.outArrows(p)).toEqual(g.outArrows(p));
          expect(g.inArrows(p)).toEqual(g.inArrows(p));
        }
      });

      it('does not let query history change adjacency order', () => {
        const a = makePort();
        const b = makePort();
        const points = win(a).points;
        const [first] = points;
        expect(first).toBeDefined();
        const cold = b.outArrows(first as PointId);
        for (const p of points) a.outArrows(p);
        expect(a.outArrows(first as PointId)).toEqual(cold);
      });

      it('makes two ports from the same description agree exactly', () => {
        const a = makePort();
        const b = makePort();
        expect(a.seedPoint()).toEqual(b.seedPoint());
        expect(win(a)).toEqual(win(b));
      });
    });

    describe('slots', () => {
      it("assigns each of a point's six arrows a distinct slot", () => {
        const g = makePort();
        for (const p of win(g).points) {
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
        for (const p of win(g).points) {
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
