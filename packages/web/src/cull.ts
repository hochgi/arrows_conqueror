/**
 * Which arrows belong on screen — graph-distance ball around the nearest point
 * to the viewport centre (SPEC §11 item 4: the board is unbounded).
 */

import type { ArrowId, GeometryPort, PointId } from '@arrows/contracts';
import { cellNearWorld, cellPoint } from '@arrows/geometry-tiling';
import type { Viewport } from './viewport';
import { visibleLatticeRadius } from './viewport';

/** Nearest lattice point to a **layout-space** position (after the 90° turn). */
export const nearestPoint = (x: number, y: number): PointId => {
  const { i, j } = cellNearWorld(x, y);
  return cellPoint(i, j);
};

export const cullArrows = (geometry: GeometryPort, viewport: Viewport): readonly ArrowId[] => {
  const centre = nearestPoint(viewport.cx, viewport.cy);
  // Chevrons stick out past their edge midpoints — a little extra radius stops
  // the clipped-tile look while panning, especially on tall phone viewports.
  const radius = visibleLatticeRadius(viewport, 3);
  return geometry.window(centre, radius).arrows;
};

export const cullVertices = (
  geometry: GeometryPort,
  viewport: Viewport,
): ReadonlySet<import('@arrows/contracts').VertexId> => {
  const centre = nearestPoint(viewport.cx, viewport.cy);
  const radius = visibleLatticeRadius(viewport, 3);
  return new Set(geometry.window(centre, radius).vertices);
};
