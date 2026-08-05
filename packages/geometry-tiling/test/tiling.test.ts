/**
 * One test per scenario in docs/spec/tiling.
 *
 * Windows are grown from `cellPoint(0, 0)` rather than `seedPoint()` wherever
 * the scenario does not specifically concern the seed, so that a failure names
 * the method actually under test instead of the one used to reach it.
 *
 * @see docs/spec/tiling/tiling.core.feature
 * @see docs/spec/tiling/tiling.edge-cases.feature
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, mintArrowId, mintPointId, mintVertexId } from '@arrows/contracts';
import type { ArrowId, GeometryPort, PointId, Slot, VertexId } from '@arrows/contracts';
import {
  DIRECTIONS,
  OUT_DIRECTIONS,
  cellArrow,
  cellPoint,
  cellVertex,
  makeTiling,
} from '../src/index';
import type { Direction, LatticeVector } from '../src/index';
import { worldAngleDegrees } from './support';

const ORIGIN = cellPoint(0, 0);
const RADIUS = 3;

const windowAt = (g: GeometryPort, radius = RADIUS): ReturnType<GeometryPort['window']> =>
  g.window(ORIGIN, radius);

/** Distinct minimal directed cycles through `p`, keyed by their arrow set. */
const cyclesThrough = (g: GeometryPort, p: PointId): Set<string> => {
  const found = new Set<string>();
  for (const a of g.outArrows(p)) {
    for (const b of g.outArrows(g.target(a))) {
      for (const c of g.outArrows(g.target(b))) {
        if (g.target(c) === p) found.add([a, b, c].toSorted().join('|'));
      }
    }
  }
  return found;
};

describe('the counts close at 3 : 1 : 2', () => {
  // A ball of radius r on the triangular lattice holds the centred hexagonal
  // number of points, so the expectation is exact rather than approximate.
  it.each([
    { r: 0, points: 1, note: 'the centre alone' },
    { r: 1, points: 7, note: 'the centre and its neighbours' },
    { r: 2, points: 19, note: '' },
    { r: 3, points: 37, note: '' },
    { r: 4, points: 61, note: "the suite's default radius" },
  ])('holds $points points in a window of radius $r', ({ r, points }) => {
    const g = makeTiling();
    const w = g.window(ORIGIN, r);
    expect(w.points).toHaveLength(points);
    const inside = new Set(w.points);
    expect(w.arrows.filter((a) => inside.has(g.origin(a)))).toHaveLength(3 * points);
  });

  it('puts every point on exactly six minimal cycles', () => {
    const g = makeTiling();
    for (const p of windowAt(g).points) {
      expect(cyclesThrough(g, p).size).toBe(6);
    }
  });
});

describe('adjacency follows the three out-directions', () => {
  it('gives every point three out-arrows and three in-arrows', () => {
    const g = makeTiling();
    for (const p of windowAt(g).points) {
      expect(g.outArrows(p)).toHaveLength(3);
      expect(g.inArrows(p)).toHaveLength(3);
    }
  });

  it('runs an arrow from its origin cell along one out-direction', () => {
    const g = makeTiling();
    const a = cellArrow(2, 2, 0);
    expect(g.origin(a)).toBe(cellPoint(2, 2));
    expect(g.target(a)).toBe(cellPoint(3, 2));
  });

  it('agrees with arrow endpoints', () => {
    const g = makeTiling();
    for (const a of windowAt(g).arrows) {
      expect(g.outArrows(g.origin(a))).toContain(a);
      expect(g.inArrows(g.target(a))).toContain(a);
    }
  });
});

describe('a cell owns two triangles, and they are its spawner vertices', () => {
  const parityOf = (v: VertexId): string => (String(v).endsWith(':up') ? 'up' : 'down');

  it('flanks every arrow with one up-triangle and one down-triangle', () => {
    // SPEC §7's cap of two feed slots per arrow is geometry, not a rule, and
    // this is the assertion that makes that true rather than hopeful.
    const g = makeTiling();
    for (const a of windowAt(g).arrows) {
      const flanks = g.flankVertices(a);
      expect(flanks).toHaveLength(2);
      expect(flanks.map(parityOf).toSorted()).toEqual(['down', 'up']);
    }
  });

  it('borders every vertex with exactly three arrows', () => {
    const g = makeTiling();
    for (const v of windowAt(g).vertices) {
      expect(g.borderArrows(v)).toHaveLength(3);
    }
  });

  it('keeps flank and border mutually inverse', () => {
    const g = makeTiling();
    const w = windowAt(g);
    for (const a of w.arrows) {
      for (const v of g.flankVertices(a)) expect(g.borderArrows(v)).toContain(a);
    }
    for (const v of w.vertices) {
      for (const a of g.borderArrows(v)) expect(g.flankVertices(a)).toContain(v);
    }
  });
});

describe('slots alternate in and out around a point', () => {
  it('gives a point six distinct slots', () => {
    const g = makeTiling();
    for (const p of windowAt(g).points) {
      const six = [...g.inArrows(p), ...g.outArrows(p)].map((a) => g.slotOf(p, a));
      expect(new Set(six).size).toBe(6);
    }
  });

  it('never puts two arrows of the same direction in adjacent slots', () => {
    // §11 item 29. The PHASE is free — this generator happens to put in-arrows
    // on the odd slots, and that is exactly the fact nothing may depend on.
    const g = makeTiling();
    for (const p of windowAt(g).points) {
      const isIn = new Map<Slot, boolean>();
      for (const a of g.inArrows(p)) isIn.set(g.slotOf(p, a), true);
      for (const a of g.outArrows(p)) isIn.set(g.slotOf(p, a), false);
      for (let s = 0; s < 6; s += 1) {
        expect(isIn.get(s as Slot)).not.toBe(isIn.get(((s + 1) % 6) as Slot));
      }
    }
  });

  it('answers a slot query the same way twice', () => {
    const g = makeTiling();
    const p = cellPoint(1, 3);
    const a = g.outArrows(p)[0] as ArrowId;
    expect(g.slotOf(p, a)).toBe(g.slotOf(p, a));
  });
});

describe('the board is unbounded and has no rim', () => {
  it('makes every point indistinguishable by degree', () => {
    const g = makeTiling();
    const degrees = windowAt(g).points.map(
      (p) => `${String(g.inArrows(p).length)}/${String(g.outArrows(p).length)}`,
    );
    expect(new Set(degrees)).toEqual(new Set(['3/3']));
  });

  it('lets every point in a window reach every other by forward movement', () => {
    const g = makeTiling();
    const w = windowAt(g);
    const confine = new Set(g.window(ORIGIN, RADIUS + 2).points);
    const sweep = (step: (p: PointId) => readonly PointId[]): Set<PointId> => {
      const seen = new Set<PointId>([ORIGIN]);
      const queue: PointId[] = [ORIGIN];
      while (queue.length > 0) {
        for (const q of step(queue.pop() as PointId)) {
          if (confine.has(q) && !seen.has(q)) {
            seen.add(q);
            queue.push(q);
          }
        }
      }
      return seen;
    };
    const forward = sweep((p) => g.outArrows(p).map((a) => g.target(a)));
    const backward = sweep((p) => g.inArrows(p).map((a) => g.origin(a)));
    for (const p of w.points) {
      expect(forward.has(p)).toBe(true);
      expect(backward.has(p)).toBe(true);
    }
  });

  it.each([
    { cell: [0, 0], note: 'the seed' },
    { cell: [1000, -1000], note: 'far out, and negative' },
    { cell: [-99999, 99999], note: 'far enough to have been a rim' },
  ])('treats cell $cell as an ordinary cell', ({ cell }) => {
    const g = makeTiling();
    const p = cellPoint(cell[0] as number, cell[1] as number);
    expect(g.inArrows(p)).toHaveLength(3);
    expect(g.outArrows(p)).toHaveLength(3);
    for (const a of g.outArrows(p)) {
      expect(g.origin(a)).toBe(p);
      expect(g.flankVertices(a)).toHaveLength(2);
    }
  });

  const walks: readonly { readonly d: Direction; readonly name: string }[] = [
    { d: 0, name: 'east' },
    { d: 1, name: 'up-left' },
    { d: 2, name: 'down-left' },
  ];

  it.each(walks)('never runs out of board walking $name for 10000 steps', ({ d }) => {
    // Arrows are named by cell rather than taken from `outArrows`, because the
    // port promises a STABLE order and not a particular one. A test that
    // assumed direction order would pin a fact §11 item 29 leaves free.
    const g = makeTiling();
    const step = OUT_DIRECTIONS[d];
    let i = 0;
    let j = 0;
    for (let n = 0; n < 10000; n += 1) {
      const a = cellArrow(i, j, d);
      expect(g.origin(a)).toBe(cellPoint(i, j));
      i += step.di;
      j += step.dj;
      expect(g.target(a)).toBe(cellPoint(i, j));
    }
    expect(g.outArrows(cellPoint(i, j))).toHaveLength(3);
  });

  it('makes a zigzag of two out-directions a straight line in the third', () => {
    // The three out-directions sum to zero, so any two compose to the reverse of
    // the third. Nothing to do with wrapping; it is why a zigzag never drifts.
    const g = makeTiling();
    let i = 0;
    let j = 0;
    for (let n = 0; n < 8; n += 1) {
      const d: Direction = n % 2 === 0 ? 1 : 2;
      const landed = g.target(cellArrow(i, j, d));
      i += OUT_DIRECTIONS[d].di;
      j += OUT_DIRECTIONS[d].dj;
      expect(landed).toBe(cellPoint(i, j));
    }
    // Four steps of the reverse of out-direction 0, and exactly on the axis.
    expect([i, j]).toEqual([-4, 0]);
  });

  it('reveals no board size or coordinate through the port', () => {
    expect(Object.keys(makeTiling()).toSorted()).toEqual([
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

describe('a degenerate window is refused', () => {
  it.each([
    { radius: -1, why: 'a ball cannot have negative extent' },
    { radius: 1.5, why: 'a graph distance is a whole number' },
    { radius: Number.NaN, why: 'not a number at all' },
    { radius: Number.POSITIVE_INFINITY, why: 'the board is unbounded; the query must not be' },
  ])('rejects a radius of $radius — $why', ({ radius }) => {
    const g = makeTiling();
    expect(() => g.window(ORIGIN, radius)).toThrow(ContractViolation);
  });

  it('yields exactly the centre at radius zero', () => {
    const g = makeTiling();
    const w = g.window(ORIGIN, 0);
    expect(w.points).toEqual([ORIGIN]);
    expect(w.arrows).toHaveLength(6);
    expect(w.vertices).toHaveLength(6);
  });

  it('still answers a very large window', () => {
    // 3r² + 3r + 1 at r = 40. Size is bounded by the ASK, never by the board.
    const g = makeTiling();
    expect(g.window(ORIGIN, 40).points).toHaveLength(4921);
  });

  it('grows monotonically with radius', () => {
    const g = makeTiling();
    const smaller = g.window(ORIGIN, 2).points;
    const larger = new Set(g.window(ORIGIN, 3).points);
    for (const p of smaller) expect(larger.has(p)).toBe(true);
  });
});

describe('girth 3, and each minimal cycle holds exactly one spawner', () => {
  const cyclesIn = (g: GeometryPort): string[][] => {
    const found = new Map<string, string[]>();
    for (const p of windowAt(g).points) {
      for (const key of cyclesThrough(g, p)) found.set(key, key.split('|'));
    }
    return [...found.values()];
  };

  it('has no cycle shorter than three', () => {
    const g = makeTiling();
    for (const a of windowAt(g).arrows) {
      expect(g.origin(a)).not.toBe(g.target(a));
      for (const b of g.outArrows(g.target(a))) {
        expect(g.target(b)).not.toBe(g.origin(a));
      }
    }
  });

  it('encloses exactly one vertex in every directed 3-cycle', () => {
    const g = makeTiling();
    for (const arrows of cyclesIn(g)) {
      const flanks = arrows.map((a) => [...g.flankVertices(a as ArrowId)].map(String));
      const shared = (flanks[0] as string[]).filter((v) =>
        flanks.every((set) => set.includes(v)),
      );
      expect(shared).toHaveLength(1);
    }
  });

  it('encloses every vertex in exactly one minimal cycle', () => {
    const g = makeTiling();
    const claimed = new Map<string, number>();
    for (const arrows of cyclesIn(g)) {
      const flanks = arrows.map((a) => [...g.flankVertices(a as ArrowId)].map(String));
      const [v] = (flanks[0] as string[]).filter((x) => flanks.every((s) => s.includes(x)));
      if (v !== undefined) claimed.set(v, (claimed.get(v) ?? 0) + 1);
    }
    expect([...claimed.values()].filter((n) => n !== 1)).toEqual([]);
  });

  it('counts a cycle once rather than once per rotation', () => {
    // A 3-cycle is discoverable from each of its three arrows. Left unstated,
    // every vertex looks like it owns three cycles and the assertion above can
    // never pass — the defect this scenario exists to prevent, and the one the
    // pending P01 suite carried until §11 item 4 forced a rework.
    const g = makeTiling();
    let raw = 0;
    for (const a of g.outArrows(ORIGIN)) {
      for (const b of g.outArrows(g.target(a))) {
        for (const c of g.outArrows(g.target(b))) {
          if (g.target(c) === ORIGIN) raw += 1;
        }
      }
    }
    // Six triangles corner the origin; enumerating from its three out-arrows
    // reaches each exactly once, so raw and distinct agree here — the collapse
    // shows up when enumerating across a window, which the suite does.
    expect(cyclesThrough(g, ORIGIN).size).toBe(6);
    expect(raw).toBe(6);
  });
});

describe('the out-directions must be 120 degrees apart, not merely sum to zero', () => {
  // Deliberately green from phase 2: these constrain a CONSTANT that was decided
  // in phase 1 (P03 D1), not a behaviour. Their job is to fail the day someone
  // "simplifies" the basis — which no other test in the repo could detect.
  const sum = OUT_DIRECTIONS.reduce<LatticeVector>(
    (acc, d) => ({ di: acc.di + d.di, dj: acc.dj + d.dj }),
    { di: 0, dj: 0 },
  );

  it('sums the three out-directions to zero', () => {
    expect(sum).toEqual({ di: 0, dj: 0 });
  });

  it('places them at 0, 120 and 240 degrees in world space', () => {
    const angles = OUT_DIRECTIONS.map((d) => worldAngleDegrees(d.di, d.dj));
    expect(angles.map((a) => Math.round(a)).toSorted((x, y) => x - y)).toEqual([0, 120, 240]);
  });

  it('puts no two of them 60 degrees apart', () => {
    // The failure mode this guards: {(1,0), (0,1), (-1,-1)} also sums to zero
    // and sits at 0/60/210, which renders skewed and passes every other test.
    const angles = OUT_DIRECTIONS.map((d) => worldAngleDegrees(d.di, d.dj));
    for (const [x, a] of angles.entries()) {
      for (const [y, b] of angles.entries()) {
        if (x === y) continue;
        const separation = Math.abs(((a - b + 540) % 360) - 180);
        expect(Math.round(separation)).toBe(120);
      }
    }
  });
});

describe('the grain constrains which symmetries setup may use', () => {
  // SPEC §2, map symmetry. Getting this wrong hands one player a board running
  // backwards — a bug no rules test could see, because both boards are legal.
  const key = (d: LatticeVector): string => `${String(d.di)},${String(d.dj)}`;
  const outs = new Set(OUT_DIRECTIONS.map(key));
  const ins = new Set(OUT_DIRECTIONS.map((d) => key({ di: -d.di, dj: -d.dj })));
  const apply = (m: readonly [number, number, number, number], d: LatticeVector): LatticeVector => ({
    di: m[0] * d.di + m[1] * d.dj,
    dj: m[2] * d.di + m[3] * d.dj,
  });

  it('preserves the grain under a 120 degree rotation', () => {
    const rotated = OUT_DIRECTIONS.map((d) => apply([-1, -1, 1, 0], d));
    expect(new Set(rotated.map(key))).toEqual(outs);
  });

  it('reverses the grain under a 180 degree rotation', () => {
    const inverted = OUT_DIRECTIONS.map((d) => apply([-1, 0, 0, -1], d));
    expect(inverted.some((d) => outs.has(key(d)))).toBe(false);
    expect(new Set(inverted.map(key))).toEqual(ins);
  });

  it('preserves the grain under the reflection, and is an involution', () => {
    const reflect = (d: LatticeVector): LatticeVector => apply([1, 1, 0, -1], d);
    expect(new Set(OUT_DIRECTIONS.map(reflect).map(key))).toEqual(outs);
    for (const d of OUT_DIRECTIONS) expect(reflect(reflect(d))).toEqual(d);
  });
});

describe('generation is deterministic', () => {
  it('makes two generators agree exactly', () => {
    const a = makeTiling();
    const b = makeTiling();
    expect(a.seedPoint()).toEqual(b.seedPoint());
    expect(windowAt(a)).toEqual(windowAt(b));
  });

  it('does not let query history change adjacency order', () => {
    const a = makeTiling();
    const b = makeTiling();
    const points = windowAt(a).points;
    const target = points[0] as PointId;
    const cold = b.outArrows(target);
    for (const p of points) a.outArrows(p);
    expect(a.outArrows(target)).toEqual(cold);
  });

  it('holds no state', () => {
    // An unbounded board cannot be precomputed, so there is no collection to
    // iterate in the wrong order — the realistic determinism failure (ADR 0001)
    // is unreachable by construction rather than by discipline. Observable as:
    // no cached property to go stale, and a well-used port answering exactly
    // like a fresh one.
    const used = makeTiling();
    for (const value of Object.values(used)) expect(typeof value).toBe('function');
    for (const p of used.window(ORIGIN, 4).points) used.inArrows(p);
    expect(used.window(ORIGIN, 2)).toEqual(makeTiling().window(ORIGIN, 2));
  });

  it('seeds from a point of its own board', () => {
    const g = makeTiling();
    const seed = g.seedPoint();
    expect(g.outArrows(seed)).toHaveLength(3);
    expect(g.window(seed, 0).points).toEqual([seed]);
  });
});

describe('foreign and malformed identifiers fail loudly', () => {
  const foreign = {
    arrow: mintArrowId('fixture-board:arrow-7'),
    point: mintPointId('fixture-board:point-2'),
    vertex: mintVertexId('fixture-board:vertex-4'),
  };

  it.each([
    { query: 'out-arrows', run: (g: GeometryPort) => g.outArrows(foreign.point) },
    { query: 'in-arrows', run: (g: GeometryPort) => g.inArrows(foreign.point) },
    { query: 'origin', run: (g: GeometryPort) => g.origin(foreign.arrow) },
    { query: 'target', run: (g: GeometryPort) => g.target(foreign.arrow) },
    { query: 'flank-vertices', run: (g: GeometryPort) => g.flankVertices(foreign.arrow) },
    { query: 'border-arrows', run: (g: GeometryPort) => g.borderArrows(foreign.vertex) },
    { query: 'window', run: (g: GeometryPort) => g.window(foreign.point, 1) },
  ])('rejects a foreign identifier given to $query', ({ run }) => {
    expect(() => run(makeTiling())).toThrow(ContractViolation);
  });

  it('rejects the slot of an arrow that is not at the point', () => {
    const g = makeTiling();
    const elsewhere = cellArrow(50, 50, 1);
    expect(() => g.slotOf(ORIGIN, elsewhere)).toThrow(ContractViolation);
  });

  it('answers for every direction a cell can name', () => {
    const g = makeTiling();
    for (const d of DIRECTIONS) {
      expect(g.origin(cellArrow(4, -2, d))).toBe(cellPoint(4, -2));
    }
    for (const parity of ['up', 'down'] as const) {
      expect(g.borderArrows(cellVertex(4, -2, parity))).toHaveLength(3);
    }
  });
});
