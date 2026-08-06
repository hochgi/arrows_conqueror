/**
 * Hit-test lattice polygons against a screen click.
 */

import type { ArrowId } from '@arrows/contracts';
import type { Point2, TilingLayout } from '@arrows/geometry-tiling';
import type { Viewport } from './viewport';
import { toLattice } from './viewport';

/** Ray-cast point-in-polygon (lattice space). */
export const pointInPolygon = (x: number, y: number, poly: readonly Point2[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    const intersect =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
};

const centroid = (poly: readonly Point2[]): Point2 => {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length || 1;
  return { x: sx / n, y: sy / n };
};

/**
 * Prefer the polygon whose centroid is closest to the click when several overlap
 * (chevron tips can nest).
 */
export const hitArrow = (
  layout: TilingLayout,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  candidates: readonly ArrowId[],
): ArrowId | undefined => {
  const { x, y } = toLattice(viewport, screenX, screenY);
  let best: ArrowId | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const arrow of candidates) {
    const poly = layout.polygon(arrow);
    if (!pointInPolygon(x, y, poly)) continue;
    const c = centroid(poly);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = arrow;
    }
  }
  return best;
};
