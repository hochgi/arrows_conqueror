/**
 * Screen geometry for one arrow — shared by the board and the effect layer.
 *
 * Extracted so an effect is anchored to the *same* tile, chord and centroid the
 * board draws, rather than to a second, subtly different reading of the layout.
 * A pulse that traces a chord one pixel off the trail it is explaining is worse
 * than no pulse at all.
 */

import type { ArrowId, GeometryPort } from '@conquarrow/contracts';
import type { Point2, TilingLayout } from '@conquarrow/geometry-tiling';
import { toScreen, type Viewport } from './viewport';

export interface ScreenSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ScreenBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** `points` attribute for a tile polygon. */
export const polyPoints = (viewport: Viewport, poly: readonly Point2[]): string =>
  poly
    .map((p) => {
      const s = toScreen(viewport, p.x, p.y);
      return `${String(s.x)},${String(s.y)}`;
    })
    .join(' ');

export const centroidScreen = (
  viewport: Viewport,
  poly: readonly Point2[],
): { readonly x: number; readonly y: number } => {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length || 1;
  return toScreen(viewport, sx / n, sy / n);
};

/** The arrow's chord: origin point → target point, i.e. along the grain. */
export const arrowChord = (
  geometry: GeometryPort,
  layout: TilingLayout,
  viewport: Viewport,
  arrow: ArrowId,
): ScreenSegment => {
  const from = layout.pointPosition(geometry.origin(arrow));
  const to = layout.pointPosition(geometry.target(arrow));
  const a = toScreen(viewport, from.x, from.y);
  const b = toScreen(viewport, to.x, to.y);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
};

export const boxOf = (viewport: Viewport, poly: readonly Point2[]): ScreenBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    const s = toScreen(viewport, p.x, p.y);
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** Effect line weights scale with zoom so a cue reads the same at any scale. */
export const inkWidth = (viewport: Viewport, factor: number, floor: number): number =>
  Math.max(floor, viewport.scale * factor);
