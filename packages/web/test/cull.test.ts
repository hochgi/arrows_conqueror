import { describe, expect, it } from 'vitest';
import { cellPoint, makeLayout, makeTiling } from '@arrows/geometry-tiling';
import { cullArrows, nearestPoint } from '../src/cull';
import { pointInPolygon } from '../src/hit';
import { createViewport, toScreen } from '../src/viewport';

describe('cull', () => {
  it('maps the origin world point to the seed lattice point', () => {
    const geometry = makeTiling();
    expect(nearestPoint(0, 0)).toBe(geometry.seedPoint());
  });

  it('inverts the layout turn — east lattice maps to screen-up', () => {
    // world(1,0) = (0, -1) after the 90° layout map; cull must snap that back to (1,0).
    const geometry = makeTiling();
    expect(nearestPoint(0, -1)).toBe(cellPoint(1, 0));
    expect(nearestPoint(0, -1)).not.toBe(geometry.seedPoint());
  });

  it("keeps a panned viewport's on-screen tiles inside the cull window", () => {
    const geometry = makeTiling();
    const layout = makeLayout();
    // Pan so the screen centre sits on lattice east (layout (0,-5)).
    const viewport = createViewport(400, 700, { x: 0, y: -5 }, 48);
    const arrows = cullArrows(geometry, viewport);
    const ids = new Set(arrows.map(String));
    // A tile near the screen centre must be present — the pre-rotation snap missed these.
    const centreArrow = geometry.window(cellPoint(5, 0), 0).arrows[0];
    expect(centreArrow).toBeDefined();
    if (centreArrow === undefined) return;
    expect(ids.has(String(centreArrow))).toBe(true);
    // And something that lands near a screen corner still has its polygon on-canvas.
    const cornerish = arrows.find((a) => {
      const poly = layout.polygon(a);
      return poly.some((p) => {
        const s = toScreen(viewport, p.x, p.y);
        return s.x > 20 && s.x < 380 && s.y > 20 && s.y < 680;
      });
    });
    expect(cornerish).toBeDefined();
  });

  it('returns a non-empty window for a default viewport', () => {
    const geometry = makeTiling();
    const arrows = cullArrows(geometry, createViewport(800, 600));
    expect(arrows.length).toBeGreaterThan(10);
  });
});

describe('hit', () => {
  it('reports the polygon centroid as inside its own tile', () => {
    const geometry = makeTiling();
    const layout = makeLayout();
    const arrow = geometry.window(geometry.seedPoint(), 1).arrows[0];
    expect(arrow).toBeDefined();
    if (arrow === undefined) return;
    const poly = layout.polygon(arrow);
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    expect(pointInPolygon(sx / poly.length, sy / poly.length, poly)).toBe(true);
  });
});
