/**
 * P09 — match setup on the tiling (hexagon homes, radial spawners).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  densityAtRadius,
  forceAtRadius,
  rational,
} from '@arrows/contracts';
import { hexCorners, homeCellsFor, makeMatch, makeTiling, reflectCell } from '../src/index';
import { thinningSample } from '../src/setup';
import { cellPoint, cellVertex, pointCell, vertexCell } from '../src/cells';

/** Graph distance of a vertex from the origin, the radius the bands are indexed by. */
const radiusOf = (vertex: Parameters<typeof vertexCell>[0]): number => {
  const { i, j } = vertexCell(vertex);
  return Math.round((Math.abs(i) + Math.abs(j) + Math.abs(-i - j)) / 2);
};

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

  it('places spawners inside R at their band force', () => {
    const state = makeMatch({ ...DEFAULT_MATCH_CONFIG, R: 3, homeOffset: 2 });
    expect(state.spawners.size).toBeGreaterThan(0);
    const geometry = makeTiling();
    for (const [vertex, spawner] of state.spawners) {
      const r = radiusOf(vertex);
      expect(r).toBeLessThanOrEqual(3);
      const expected = forceAtRadius(r, 3);
      expect(spawner.force).toEqual(rational(expected.num, expected.den));
      expect(geometry.borderArrows(vertex)).toHaveLength(3);
    }
  });

  it('runs the centre at 1/3 and the rim at 1/12, four to one', () => {
    // The values are the three §7's force table names and nothing between them, and the
    // *ratio* is the point: P09's `1/3^r` placeholder ran the rim at 1/2187 against 1/3 in
    // the middle, so the centre was not merely better, it was the only economy on the
    // board. Pinned as numbers because a retune here should be a visible edit.
    expect(forceAtRadius(0, 7)).toEqual({ num: 1, den: 3 });
    expect(forceAtRadius(1, 7)).toEqual({ num: 1, den: 3 });
    expect(forceAtRadius(2, 7)).toEqual({ num: 1, den: 9 });
    expect(forceAtRadius(3, 7)).toEqual({ num: 1, den: 9 });
    expect(forceAtRadius(4, 7)).toEqual({ num: 1, den: 12 });
    expect(forceAtRadius(7, 7)).toEqual({ num: 1, den: 12 });
    // Denominators stay small and 9-against-12 stays coprime-ish enough to give §7's
    // 7/36 compound rhythm on a double-fed arrow.
    for (const r of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const { num, den } = forceAtRadius(r, 7);
      expect(num / den).toBeLessThanOrEqual(1 / 3);
      expect(den).toBeLessThanOrEqual(12);
    }
  });

  it('thins density with radius, keeping the centre whole', () => {
    expect(densityAtRadius(1, 7)).toEqual({ num: 1, den: 1 });
    expect(densityAtRadius(3, 7)).toEqual({ num: 1, den: 2 });
    expect(densityAtRadius(5, 7)).toEqual({ num: 1, den: 4 });
    expect(densityAtRadius(7, 7)).toEqual({ num: 1, den: 8 });

    const state = makeMatch();
    const byBand = new Map<number, number>();
    for (const vertex of state.spawners.keys()) {
      const r = radiusOf(vertex);
      byBand.set(r, (byBand.get(r) ?? 0) + 1);
    }
    // 14 eligible vertices inside r = 1 (2 at the origin, 12 at distance 1) — all kept.
    expect((byBand.get(0) ?? 0) + (byBand.get(1) ?? 0)).toBe(14);
    // 12r eligible at radius r beyond that, and the rim is meant to be sparse.
    expect(byBand.get(7) ?? 0).toBeLessThan(84 / 4);
    // The whole disc is thinned well below the 338 the un-thinned board carried.
    expect(state.spawners.size).toBeLessThan(150);
  });

  it('thins by a pure hash of the vertex, never a draw', () => {
    // §7 permits density below 1 only if *which* vertices survive is a pure function of
    // the vertex and a setup seed. Two calls agreeing is the whole of ADR 0001 here.
    const cell = { i: 3, j: -1, parity: 'up' } as const;
    const once = thinningSample(cell, 1);
    expect(thinningSample(cell, 1)).toBe(once);
    expect(once).toBeGreaterThanOrEqual(0);
    expect(once).toBeLessThan(1);
    // Neighbours must not correlate, or the survivors land on a sublattice and the
    // clustering §7 wants for double-fed arrows never happens.
    expect(thinningSample({ i: 4, j: -1, parity: 'up' }, 1)).not.toBe(once);
    expect(thinningSample({ i: 3, j: -1, parity: 'down' }, 1)).not.toBe(once);
    expect(thinningSample(cell, 2)).not.toBe(once);

    // A different seed reshuffles which vertices carry one without changing the game.
    const a = makeMatch();
    const b = makeMatch({ ...DEFAULT_MATCH_CONFIG, spawnerSeed: 9 });
    const keysA = [...a.spawners.keys()].map(String).toSorted();
    const keysB = [...b.spawners.keys()].map(String).toSorted();
    expect(keysB).not.toEqual(keysA);
  });

  it('gives every home vertex a spawner whatever the thinning says', () => {
    const state = makeMatch({ ...DEFAULT_MATCH_CONFIG, playerCount: 6, homeOffset: 6 });
    const homes = homeCellsFor(6, 6);
    for (const home of homes) {
      expect(state.spawners.has(cellVertex(home.i, home.j, 'up'))).toBe(true);
    }
  });

  it('keeps seedPoint at the origin', () => {
    expect(pointCell(makeTiling().seedPoint())).toEqual({ i: 0, j: 0 });
    expect(cellPoint(0, 0)).toBe(makeTiling().seedPoint());
  });
});
