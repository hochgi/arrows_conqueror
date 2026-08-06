import { describe, expect, it } from 'vitest';
import { makeLayout, makeTiling } from '@arrows/geometry-tiling';
import { cullArrows, nearestPoint } from '../src/cull';
import { pointInPolygon } from '../src/hit';
import { createViewport } from '../src/viewport';

describe('cull', () => {
  it('maps the origin world point to the seed lattice point', () => {
    const geometry = makeTiling();
    expect(nearestPoint(0, 0)).toBe(geometry.seedPoint());
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
