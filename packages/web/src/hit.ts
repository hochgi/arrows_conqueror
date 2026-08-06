/**
 * Hit-test lattice polygons against a screen click.
 */

import type { ArrowId, VertexId } from '@arrows/contracts';
import type { Point2, TilingLayout } from '@arrows/geometry-tiling';
import type { Viewport } from './viewport';
import { toLattice, toScreen } from './viewport';

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

/**
 * Nearest spawner vertex to the cursor, within `radius` screen pixels.
 *
 * A vertex is not a tile and has no polygon to be inside (§7 — that is the whole reason
 * specials live there), so hovering one is a proximity test in **screen** space rather
 * than a hit test in lattice space. Screen space is also the right frame for the tolerance:
 * the target should stay the same size under the cursor at every zoom level.
 *
 * `candidates` must be the **spawner** vertices, not every vertex in view: nearest-vertex
 * over all of them lets a bare pinwheel centre a few pixels closer steal the hover from the
 * spawner the cursor is on.
 */
export const hitSpawnerVertex = (
  layout: TilingLayout,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  candidates: Iterable<VertexId>,
  radius: number,
): VertexId | undefined => {
  let best: VertexId | undefined;
  let bestDist = radius * radius;
  for (const vertex of candidates) {
    const pos = layout.vertexPosition(vertex);
    const s = toScreen(viewport, pos.x, pos.y);
    const d = (s.x - screenX) ** 2 + (s.y - screenY) ** 2;
    if (d <= bestDist) {
      bestDist = d;
      best = vertex;
    }
  }
  return best;
};
