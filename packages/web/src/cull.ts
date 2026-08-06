/**
 * Which arrows belong on screen — graph-distance ball around the nearest point
 * to the viewport centre (SPEC §11 item 4: the board is unbounded).
 */

import type { ArrowId, GeometryPort, PointId } from '@arrows/contracts';
import { cellPoint } from '@arrows/geometry-tiling';
import type { Viewport } from './viewport';
import { visibleLatticeRadius } from './viewport';

const ROOT3_OVER_2 = Math.sqrt(3) / 2;

/** Nearest lattice point to a world position (basis u=(1,0), v=(½,√3/2)). */
export const nearestPoint = (x: number, y: number): PointId => {
  const j = Math.round(y / ROOT3_OVER_2);
  const i = Math.round(x - j / 2);
  return cellPoint(i, j);
};

export const cullArrows = (geometry: GeometryPort, viewport: Viewport): readonly ArrowId[] => {
  const centre = nearestPoint(viewport.cx, viewport.cy);
  const radius = visibleLatticeRadius(viewport);
  return geometry.window(centre, radius).arrows;
};

export const cullVertices = (
  geometry: GeometryPort,
  viewport: Viewport,
): ReadonlySet<import('@arrows/contracts').VertexId> => {
  const centre = nearestPoint(viewport.cx, viewport.cy);
  const radius = visibleLatticeRadius(viewport);
  return new Set(geometry.window(centre, radius).vertices);
};
