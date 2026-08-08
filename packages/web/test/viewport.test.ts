import { describe, expect, it } from 'vitest';
import {
  ZOOM,
  centerOn,
  clampZoom,
  createViewport,
  panBy,
  toLattice,
  toScreen,
  visibleLatticeRadius,
  zoomAt,
} from '../src/viewport';

describe('viewport', () => {
  it('clamps zoom to the PoC band', () => {
    expect(clampZoom(1)).toBe(ZOOM.min);
    expect(clampZoom(1000)).toBe(ZOOM.max);
    expect(clampZoom(ZOOM.default)).toBe(ZOOM.default);
  });

  it('round-trips screen and lattice through the centre', () => {
    const v = createViewport(400, 300, { x: 2, y: 1 }, 40);
    const s = toScreen(v, 2, 1);
    expect(s.x).toBeCloseTo(200);
    expect(s.y).toBeCloseTo(150);
    const back = toLattice(v, s.x, s.y);
    expect(back.x).toBeCloseTo(2);
    expect(back.y).toBeCloseTo(1);
  });

  it('pans opposite to the drag (grab the board)', () => {
    const v = createViewport(400, 300, { x: 0, y: 0 }, 40);
    const next = panBy(v, 40, 0);
    expect(next.cx).toBeCloseTo(-1);
  });

  it('centers on a lattice point without changing zoom', () => {
    const v = createViewport(400, 300, { x: 0, y: 0 }, 40);
    const next = centerOn(v, 3, -2);
    expect(next.cx).toBe(3);
    expect(next.cy).toBe(-2);
    expect(next.scale).toBe(40);
  });

  it('zooms about the cursor without drifting the lattice point under it', () => {
    const v = createViewport(400, 300, { x: 0, y: 0 }, 40);
    const sx = 300;
    const sy = 100;
    const before = toLattice(v, sx, sy);
    const next = zoomAt(v, sx, sy, 2);
    const after = toLattice(next, sx, sy);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scale).toBe(80);
  });

  it('sizes the cull radius from the screen diagonal', () => {
    const v = createViewport(400, 300, { x: 0, y: 0 }, 40);
    expect(visibleLatticeRadius(v, 0)).toBeGreaterThan(0);
  });
});
