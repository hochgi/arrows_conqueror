/**
 * Place a spawner's three share arcs by where the bordering tiles sit, not by
 * arrow-id order. Sorted ids lined the same physical share up on opposite
 * compass slots of neighbouring spawners.
 */

import type { Point2 } from '@conquarrow/geometry-tiling';

export const GAP_DEG = 22;

export const polygonCentroid = (poly: readonly Point2[]): Point2 => {
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
 * Compass degrees from `from` toward `to` in layout space: 0 north, 90 east,
 * 180 south. Matches `arcPath` in `Board` (`d - 90`, SVG +y down).
 */
export const compassDeg = (from: Point2, to: Point2): number => {
  const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
};

export const shareArcSpan = (
  vertex: Point2,
  arrowCentroid: Point2,
  gapDeg: number = GAP_DEG,
): { readonly from: number; readonly to: number } => {
  const mid = compassDeg(vertex, arrowCentroid);
  const half = (120 - gapDeg) / 2;
  return { from: mid - half, to: mid + half };
};
