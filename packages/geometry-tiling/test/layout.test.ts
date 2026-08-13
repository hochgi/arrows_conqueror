/**
 * One test per scenario in docs/spec/layout.
 *
 * Layout is the only executable check on a constant no rule can see (SPEC §2's
 * out-directions must sit 120° apart, not merely sum to zero) and on the up/down
 * twist parity, whose wrong value still tiles the plane perfectly. Both failure
 * modes are invisible to every other test in the repo.
 *
 * @see docs/spec/layout/layout.core.feature
 * @see docs/spec/layout/layout.edge-cases.feature
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation } from '@conquarrow/contracts';
import type { ArrowId, GeometryPort } from '@conquarrow/contracts';
import {
  MEASURED_SILHOUETTE,
  TILE_AREA,
  cellArrow,
  cellPoint,
  makeLayout,
  makeTiling,
} from '../src/index';
import type { Point2, TilingLayout } from '../src/index';
import {
  area,
  congruentByRotation,
  congruentByTranslation,
  contains,
  hasVertexAt,
  isCentrallySymmetric,
  maxVertexShift,
  near,
  samePoint,
  vertexCentroid,
  withoutCollinear,
} from './support';

const ORIGIN = cellPoint(0, 0);
const RADIUS = 4;

const board = (): GeometryPort => makeTiling();
const arrowsAround = (g: GeometryPort): readonly ArrowId[] => g.window(ORIGIN, RADIUS).arrows;
const measured = (): TilingLayout => makeLayout(MEASURED_SILHOUETTE);

describe('every arrow gets one closed 8-vertex polygon', () => {
  it('gives each arrow a polygon', () => {
    const g = board();
    const l = measured();
    const arrows = arrowsAround(g);
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      expect(l.polygon(a)).toHaveLength(8);
    }
  });

  it('gives a polygon eight vertices, not repeating the first', () => {
    const l = measured();
    const poly = l.polygon(cellArrow(1, 1, 0));
    expect(poly).toHaveLength(8);
    expect(samePoint(poly[0] as Point2, poly[7] as Point2)).toBe(false);
  });

  it('returns the same polygon across calls', () => {
    const l = measured();
    const a = cellArrow(1, 1, 0);
    expect(l.polygon(a)).toEqual(l.polygon(a));
  });

  it('gives an arrow far from the origin one too', () => {
    // The board is unbounded (SPEC §11 item 4), so there is no region layout may
    // decline to draw and no clipping anywhere in this package.
    const l = measured();
    const far = l.polygon(cellArrow(100000, -100000, 1));
    expect(far).toHaveLength(8);
    expect(congruentByTranslation(far, l.polygon(cellArrow(0, 0, 1)))).toBe(true);
  });
});

describe("a tile is anchored to its arrow's endpoints and flanks", () => {
  const anchored = cellArrow(2, 2, 0);

  it('puts two of its vertices at the arrow endpoints', () => {
    const g = board();
    const l = measured();
    const poly = l.polygon(anchored);
    expect(hasVertexAt(poly, l.pointPosition(g.origin(anchored)))).toBe(true);
    expect(hasVertexAt(poly, l.pointPosition(g.target(anchored)))).toBe(true);
  });

  it('puts two of its vertices at the flank centres', () => {
    const g = board();
    const l = measured();
    const poly = l.polygon(anchored);
    for (const v of g.flankVertices(anchored)) {
      expect(hasVertexAt(poly, l.vertexPosition(v))).toBe(true);
    }
  });

  it('meets the three tiles around a vertex at its centre', () => {
    const g = board();
    const l = measured();
    for (const v of g.window(ORIGIN, 2).vertices) {
      const centre = l.vertexPosition(v);
      const borders = g.borderArrows(v);
      expect(borders).toHaveLength(3);
      for (const a of borders) expect(hasVertexAt(l.polygon(a), centre)).toBe(true);
    }
  });
});

describe('the polygons tile the plane', () => {
  it('gives every tile an area of exactly √3/6', () => {
    // A lattice cell has area √3/2 and holds 3 arrows. Within one triangle all
    // three spokes bend identically, so its 3-fold symmetry about the centre
    // makes the three pieces congruent — √3/12 each, two per tile.
    const g = board();
    const l = measured();
    for (const a of arrowsAround(g)) {
      expect(near(area(l.polygon(a)), TILE_AREA, 1e-9)).toBe(true);
    }
  });

  it('overlaps no two tiles, and leaves no gap', () => {
    // Sampled rather than computed: a dense grid well inside the window, offset
    // by an awkward fraction so no sample lands on a shared edge. Each sample
    // must be inside exactly one tile — which catches an overlap and a gap with
    // the same assertion, where a summed area catches neither on its own.
    const g = board();
    const l = measured();
    const tiles = arrowsAround(g).map((a) => l.polygon(a));
    for (let sx = -8; sx <= 8; sx += 1) {
      for (let sy = -8; sy <= 8; sy += 1) {
        // Offsets deliberately not round, so no sample lands on a lattice line
        // or a shared spoke, where containment is undefined either way.
        const sample: Point2 = { x: sx * 0.1873 + 0.02931, y: sy * 0.1873 + 0.01117 };
        const hits = tiles.filter((t) => contains(t, sample)).length;
        expect(hits).toBe(1);
      }
    }
  });

  it('makes neighbouring tiles agree on their shared spoke', () => {
    // The bend belongs to the (triangle, corner) pair, not to a tile. Both tiles
    // meeting along a spoke must use the identical bent path or the plane stops
    // being tiled — this is the mistake that produced the first broken chevron.
    const g = board();
    const l = measured();
    const a = cellArrow(0, 0, 0);
    const [shared] = g.flankVertices(a);
    if (shared === undefined) throw new Error('an arrow must flank two vertices');
    const sibling = g.borderArrows(shared).find((x) => x !== a);
    if (sibling === undefined) throw new Error('a vertex must border three arrows');

    const centre = l.vertexPosition(shared);
    const theirs = l.polygon(sibling);
    const mine = l.polygon(a);
    expect(hasVertexAt(mine, centre)).toBe(true);
    expect(hasVertexAt(theirs, centre)).toBe(true);

    // Exactly three, and which three is the point: the shared lattice point,
    // the bend control point, and the triangle centre — the whole path
    // `point → bend → centre`. Two would mean they meet only at the ends and
    // the bend disagreed, which is the gap-leaving mistake.
    const common = mine.filter((p) => hasVertexAt(theirs, p));
    expect(common).toHaveLength(3);
    expect(common.some((p) => samePoint(p, centre))).toBe(true);
  });
});

describe('twist zero is a rhombus, twist non-zero is an arrow', () => {
  const flat = (): TilingLayout => makeLayout({ twistDegrees: 0, bendFraction: 0.36 });

  it('collapses a tile to four distinct corners at twist zero', () => {
    // The polygon still has eight vertices — at twist 0 the bend points sit ON
    // their spokes rather than off them, so they are collinear with the corners
    // they lie between. Drop those and a rhombus is what is left.
    const g = board();
    const l = flat();
    const a = cellArrow(1, 1, 0);
    const poly = l.polygon(a);
    expect(poly).toHaveLength(8);

    const corners = withoutCollinear(poly);
    expect(corners).toHaveLength(4);
    const expected = [
      l.pointPosition(g.origin(a)),
      l.pointPosition(g.target(a)),
      ...g.flankVertices(a).map((v) => l.vertexPosition(v)),
    ];
    for (const c of expected) expect(hasVertexAt(corners, c)).toBe(true);
  });

  it('still tiles at twist zero', () => {
    const g = board();
    const l = flat();
    for (const a of arrowsAround(g)) {
      expect(near(area(l.polygon(a)), TILE_AREA, 1e-9)).toBe(true);
    }
  });

  it('gives a tile a head and a tail at non-zero twist', () => {
    const l = measured();
    const poly = l.polygon(cellArrow(1, 1, 0));
    expect(isCentrallySymmetric(poly, vertexCentroid(poly))).toBe(false);
  });

  it('draws direction-0 toward screen-up (former east)', () => {
    // Layout applies a 90° turn so the primary out is an up-chevron, not a right one.
    const l = measured();
    const g = board();
    const arrow = cellArrow(0, 0, 0);
    const origin = l.pointPosition(g.origin(arrow));
    const target = l.pointPosition(g.target(arrow));
    expect(target.y).toBeLessThan(origin.y);
    expect(Math.abs(target.x - origin.x)).toBeLessThan(1e-9);
  });
});

describe('up and down triangles must twist oppositely', () => {
  // The finding this packet exists to record. Same-direction twisting still
  // tiles, so no gap-or-overlap test catches it — it silently produces a
  // symmetric zigzag with two points and no arrowhead.
  const opposite = (): TilingLayout =>
    makeLayout({ twistDegrees: 87, bendFraction: 0.36, twistParity: 'opposite' });
  const same = (): TilingLayout =>
    makeLayout({ twistDegrees: 87, bendFraction: 0.36, twistParity: 'same' });

  it('makes the tile asymmetric under opposite twist', () => {
    const poly = opposite().polygon(cellArrow(1, 1, 0));
    expect(isCentrallySymmetric(poly, vertexCentroid(poly))).toBe(false);
  });

  it('makes the tile centrally symmetric under same-direction twist', () => {
    // Recorded as the WRONG configuration. Kept as a scenario because it is
    // indistinguishable from the right one by area, vertex count or tiling.
    const poly = same().polygon(cellArrow(1, 1, 0));
    expect(isCentrallySymmetric(poly, vertexCentroid(poly))).toBe(true);
  });

  it('tiles the plane under both conventions', () => {
    const g = board();
    for (const l of [opposite(), same()]) {
      for (const a of arrowsAround(g)) {
        expect(near(area(l.polygon(a)), TILE_AREA, 1e-9)).toBe(true);
      }
    }
  });
});

describe('the silhouette parameters are tunable without moving a tile', () => {
  it.each([
    { twistDegrees: 0, bendFraction: 0.36, note: 'rhombus, the debugging view' },
    { twistDegrees: 87, bendFraction: 0.36, note: 'the measured POC values' },
    { twistDegrees: 100, bendFraction: 0.2, note: 'a deeper, thinner arm' },
    { twistDegrees: -87, bendFraction: 0.36, note: 'mirrored handedness' },
  ])('keeps every arrow and every area at twist $twistDegrees bend $bendFraction', (params) => {
    const g = board();
    const l = makeLayout(params);
    for (const a of arrowsAround(g)) {
      expect(l.polygon(a)).toHaveLength(8);
      expect(near(area(l.polygon(a)), TILE_AREA, 1e-9)).toBe(true);
    }
  });

  it('branches on no particular twist value', () => {
    // A threshold on a tuning value is the exact thing SPEC §7 forbids for
    // spawner force, and it would survive every fixed-value test above. What
    // detects it is CONTINUITY: `if (twist === 87)` puts a jump in the map from
    // twist to polygon, and nothing else does.
    const a = cellArrow(1, 1, 0);
    const step = 0.5;
    let worst = 0;
    for (let t = -180; t < 180; t += step) {
      const here = makeLayout({ twistDegrees: t, bendFraction: 0.36 }).polygon(a);
      const next = makeLayout({ twistDegrees: t + step, bendFraction: 0.36 }).polygon(a);
      expect(here).toHaveLength(8);
      worst = Math.max(worst, maxVertexShift(here, next));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('branches on no particular bend value', () => {
    const a = cellArrow(1, 1, 0);
    const step = 0.002;
    let worst = 0;
    for (let b = 0.05; b < 0.95; b += step) {
      const here = makeLayout({ twistDegrees: 87, bendFraction: b }).polygon(a);
      const next = makeLayout({ twistDegrees: 87, bendFraction: b + step }).polygon(a);
      worst = Math.max(worst, maxVertexShift(here, next));
    }
    expect(worst).toBeLessThan(0.02);
  });
});

describe('layout is the only check on the out-direction constant', () => {
  // The scenario this packet exists for, and the ONLY assertion in the repo
  // that sees the implementation's own basis.
  //
  // Everything else is blind to a shear. A basis with the same determinant
  // preserves every tile's area, every vertex count, translation invariance,
  // continuity in twist and bend, and the central-symmetry parity — verified by
  // shearing `world` and watching the suite stay green. The 0/120/240 angle
  // check in tiling.test.ts does not help either: it computes world angles from
  // a basis the TEST defines, so it constrains the constant and never the code.

  it('makes the three tiles around a vertex 120 degree rotations of each other', () => {
    const g = board();
    const l = measured();
    for (const v of g.window(ORIGIN, 2).vertices) {
      const centre = l.vertexPosition(v);
      const [a, b, c] = g.borderArrows(v);
      if (a === undefined || b === undefined || c === undefined) {
        throw new Error('a vertex must border three arrows');
      }
      const polys = [l.polygon(a), l.polygon(b), l.polygon(c)];
      // Some rotation by ±120° carries each tile onto another. Which one depends
      // on the order `borderArrows` happens to return, which is not pinned.
      for (const p of polys) {
        const lands = polys.filter(
          (q) =>
            congruentByRotation(p, q, centre, 120) || congruentByRotation(p, q, centre, -120),
        );
        expect(lands.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('fails that rotation check for a skewed basis', () => {
    // The counterfactual, so the assertion above is known to be load-bearing
    // rather than vacuously satisfiable. Shearing keeps the determinant, so the
    // tiling is still gapless and every tile still has area √3/6 — and the
    // rotation check still notices.
    const g = board();
    const l = measured();
    const shear = (p: Point2): Point2 => ({ x: p.x + 0.12 * p.y, y: p.y });
    const [v] = g.window(ORIGIN, 1).vertices;
    if (v === undefined) throw new Error('the window must hold a vertex');
    const centre = shear(l.vertexPosition(v));
    const polys = g.borderArrows(v).map((a) => l.polygon(a).map(shear));
    const anyPair = polys.some((p) =>
      polys.some(
        (q) =>
          q !== p &&
          (congruentByRotation(p, q, centre, 120) || congruentByRotation(p, q, centre, -120)),
      ),
    );
    expect(anyPair).toBe(false);
  });
});

describe('layout is translation-invariant, because the board is', () => {
  it.each([
    { cell: [5, 0], note: 'a nearby cell' },
    { cell: [-3, 7], note: 'negative coordinates' },
    { cell: [400, 400], note: 'far outside any window' },
  ])('draws direction 0 at cell $cell as the same shape moved', ({ cell }) => {
    const l = measured();
    const here = l.polygon(cellArrow(0, 0, 0));
    const there = l.polygon(cellArrow(cell[0] as number, cell[1] as number, 0));
    expect(congruentByTranslation(there, here)).toBe(true);
  });

  it('clips nothing and knows no viewport', () => {
    // Two observable halves. The accepted parameter set names no screen
    // concern — no scale, no offset, no bounds. And a tile 400 cells out lands
    // 400 cells out: anything clamped or clipped would fail the distance check
    // while still returning eight plausible vertices.
    const l = measured();
    expect(Object.keys(l.params).toSorted()).toEqual([
      'bendFraction',
      'twistDegrees',
      'twistParity',
    ]);
    const far = l.polygon(cellArrow(400, 400, 0));
    const here = l.polygon(cellArrow(0, 0, 0));
    const shift = maxVertexShift(here, far);
    expect(shift).toBeGreaterThan(400);
    expect(Number.isFinite(shift)).toBe(true);
  });
});

describe('degenerate parameters are refused', () => {
  it.each([
    { bendFraction: 0, why: 'the spoke collapses to the triangle centre' },
    { bendFraction: 1, why: 'the spoke collapses onto the corner' },
    { bendFraction: -0.1, why: 'a bend is a fraction of the way out' },
    { bendFraction: 1.4, why: 'past the corner, so tiles would self-intersect' },
  ])('rejects a bend of $bendFraction — $why', ({ bendFraction }) => {
    expect(() => makeLayout({ twistDegrees: 87, bendFraction })).toThrow(ContractViolation);
  });

  it('accepts the measured values', () => {
    expect(() => makeLayout(MEASURED_SILHOUETTE)).not.toThrow();
    expect(measured().params.twistParity).toBe('opposite');
  });
});
