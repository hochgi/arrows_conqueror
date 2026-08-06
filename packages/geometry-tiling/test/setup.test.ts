/**
 * P09 — match setup on the tiling (hexagon homes, radial spawners).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_CONFIG, forceAtRadius, rational } from '@arrows/contracts';
import { hexCorners, homeCellsFor, makeMatch, makeTiling, reflectCell } from '../src/index';
import { cellPoint, pointCell, vertexCell } from '../src/cells';

describe('match setup', () => {
  it('places two homes on opposite hexagon corners with 3-stacks', () => {
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
    const byOwner = new Map<string, number>();
    for (const owner of state.territory.values()) {
      byOwner.set(String(owner), (byOwner.get(String(owner)) ?? 0) + 1);
    }
    expect([...byOwner.values()].toSorted((a, b) => a - b)).toEqual([3, 3]);

    const D = DEFAULT_MATCH_CONFIG.homeOffset;
    expect(homeCellsFor(2, D)).toEqual([hexCorners(D)[0], hexCorners(D)[3]]);
  });

  it('places three homes on alternating corners', () => {
    const state = makeMatch({ ...DEFAULT_MATCH_CONFIG, playerCount: 3 });
    expect(state.players.map(String)).toEqual(['A', 'B', 'C']);
    expect(state.groups.size).toBe(3);
    expect(homeCellsFor(3, 5)).toEqual([
      { i: 5, j: 0 },
      { i: -5, j: 5 },
      { i: 0, j: -5 },
    ]);
  });

  it('places six homes on every hexagon corner', () => {
    const state = makeMatch({ ...DEFAULT_MATCH_CONFIG, playerCount: 6, homeOffset: 4 });
    expect(state.players).toHaveLength(6);
    expect(state.groups.size).toBe(6);
    expect(homeCellsFor(6, 4)).toEqual(hexCorners(4));
  });

  it('keeps the grain-preserving reflection as an involution', () => {
    const homeA = { i: 5, j: 0 };
    const homeB = reflectCell(homeA);
    expect(reflectCell(homeB)).toEqual(homeA);
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
