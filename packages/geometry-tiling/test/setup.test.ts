/**
 * P09 — match setup on the tiling (reflection homes, radial spawners).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_CONFIG, forceAtRadius, rational } from '@arrows/contracts';
import { makeMatch, makeTiling, reflectCell } from '../src/index';
import { cellPoint, pointCell, vertexCell } from '../src/cells';

describe('match setup', () => {
  it('places mirrored homes with 3-stacks and pinwheel territory', () => {
    const state = makeMatch();
    expect(state.players).toHaveLength(2);
    expect(state.dominationN).toBe(5);
    expect(state.winner).toBeUndefined();

    const tips = [...state.groups.entries()];
    expect(tips).toHaveLength(2);
    for (const [, group] of tips) {
      expect(group.heads).toBe(3);
      expect(group.spent).toBe(0);
    }
    // Each home owns exactly three territory arrows (the pinwheel).
    const byOwner = new Map<string, number>();
    for (const owner of state.territory.values()) {
      byOwner.set(String(owner), (byOwner.get(String(owner)) ?? 0) + 1);
    }
    expect([...byOwner.values()]).toEqual([3, 3]);
  });

  it('uses the grain-preserving reflection for homes', () => {
    const homeA = { i: DEFAULT_MATCH_CONFIG.homeOffset, j: 2 };
    const homeB = reflectCell(homeA);
    expect(reflectCell(homeB)).toEqual(homeA);
    expect(homeB).not.toEqual(homeA);
  });

  it('places spawners within R with force 1/3^r', () => {
    const state = makeMatch({ ...DEFAULT_MATCH_CONFIG, R: 3, homeOffset: 2 });
    expect(state.spawners.size).toBeGreaterThan(0);
    const geometry = makeTiling();
    for (const [vertex, spawner] of state.spawners) {
      const { i, j } = vertexCell(vertex);
      const k = -i - j;
      const r = Math.max(1, Math.round((Math.abs(i) + Math.abs(j) + Math.abs(k)) / 2));
      const expected = forceAtRadius(Math.min(r, 3), 3);
      expect(spawner.force).toEqual(rational(expected.num, expected.den));
      expect(geometry.borderArrows(vertex)).toHaveLength(3);
    }
  });

  it('keeps seedPoint at the origin', () => {
    expect(pointCell(makeTiling().seedPoint())).toEqual({ i: 0, j: 0 });
    expect(cellPoint(0, 0)).toBe(makeTiling().seedPoint());
  });
});
