/**
 * Test-only helpers. Not exported from the package.
 *
 * The polygon maths here is deliberately independent of the implementation —
 * shoelace area and a ray-cast containment test, both textbook — so that a
 * layout bug cannot hide behind a helper that shares its mistake.
 */

import type { Point2 } from '../src/index';

/** Signed shoelace area; positive for counter-clockwise. */
export const signedArea = (poly: readonly Point2[]): number => {
  let total = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as Point2;
    const b = poly[(i + 1) % poly.length] as Point2;
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
};

export const area = (poly: readonly Point2[]): number => Math.abs(signedArea(poly));

/** Standard crossing-number containment. Boundary results are unspecified, so sample off-edge. */
export const contains = (poly: readonly Point2[], p: Point2): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as Point2;
    const b = poly[j] as Point2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

export const EPS = 1e-9;

export const near = (a: number, b: number, eps = EPS): boolean => Math.abs(a - b) < eps;

export const samePoint = (a: Point2, b: Point2, eps = EPS): boolean =>
  near(a.x, b.x, eps) && near(a.y, b.y, eps);

/** Does `poly` have a vertex at `p`? */
export const hasVertexAt = (poly: readonly Point2[], p: Point2, eps = EPS): boolean =>
  poly.some((q) => samePoint(q, p, eps));

/** The centroid of a polygon's vertices — the centre a symmetric tile inverts about. */
export const vertexCentroid = (poly: readonly Point2[]): Point2 => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

/**
 * Is the polygon centrally symmetric about `c`? True for a same-direction twist
 * (the wrong silhouette), false for the artwork's opposing twist.
 */
export const isCentrallySymmetric = (poly: readonly Point2[], c: Point2, eps = 1e-7): boolean =>
  poly.every((p) => hasVertexAt(poly, { x: 2 * c.x - p.x, y: 2 * c.y - p.y }, eps));

/** Are two polygons the same shape, moved? Allows a cyclic rotation of the vertex list. */
export const congruentByTranslation = (
  a: readonly Point2[],
  b: readonly Point2[],
  eps = 1e-7,
): boolean => {
  if (a.length !== b.length) return false;
  return Array.from({ length: a.length }).some((_, shift) => {
    const first = a[0] as Point2;
    const partner = b[shift % b.length] as Point2;
    const dx = partner.x - first.x;
    const dy = partner.y - first.y;
    return a.every((p, k) => {
      const q = b[(k + shift) % b.length] as Point2;
      return near(q.x - p.x, dx, eps) && near(q.y - p.y, dy, eps);
    });
  });
};

/**
 * Drop vertices that lie on the straight line between their neighbours.
 *
 * At twist 0 the bend points sit *on* their spokes rather than off them, so the
 * polygon still has eight vertices while the shape it bounds is a rhombus with
 * four corners. This is what "the 8 vertices lie on 4 distinct corners" means.
 */
export const withoutCollinear = (poly: readonly Point2[], eps = 1e-9): Point2[] =>
  poly.filter((p, k) => {
    const prev = poly[(k - 1 + poly.length) % poly.length] as Point2;
    const next = poly[(k + 1) % poly.length] as Point2;
    const cross = (p.x - prev.x) * (next.y - prev.y) - (p.y - prev.y) * (next.x - prev.x);
    return Math.abs(cross) > eps;
  });

/** The largest distance any vertex moved between two polygons of equal length. */
export const maxVertexShift = (a: readonly Point2[], b: readonly Point2[]): number => {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  return a.reduce((worst, p, k) => {
    const q = b[k] as Point2;
    return Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y));
  }, 0);
};

/** World angle of a lattice vector under basis u = (1,0), v = (½, √3⁄2), in degrees. */
export const worldAngleDegrees = (di: number, dj: number): number => {
  const x = di + dj / 2;
  const y = (dj * Math.sqrt(3)) / 2;
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
};
