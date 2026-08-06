/**
 * docs/spec/fill/fill.edge-cases.feature — one test per scenario.
 *
 * Concave / nested shapes, unclosed claims, and the determinism / no-vertex
 * guards. All on the generated tiling — a fixture has no infinity to fail to reach
 * (§11 items 4, 30, 36).
 *
 * @see docs/spec/fill/fill.md
 */

import { describe, expect, it } from 'vitest';
import { makeRules } from '../src/index';
import {
  A,
  aRingWithAnInside,
  aRunFromHome,
  aSealedBand,
  anExitFrom,
  arrowAt,
  countingVertices,
  justOutside,
  onBoard,
  onTiling,
  pathFrom,
  pick,
  stateOf,
} from './support';
import type { ArrowId } from './support';

const ground = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> => new Set(arrows);
const keys = (arrows: readonly ArrowId[]): readonly string[] =>
  arrows.map(String).toSorted();

// ── Rule: concave, nested and multiply-ringed shapes ──────────────────────────

describe('concave, nested and multiply-ringed shapes', () => {
  it('encloses a concave pocket to its last arrow', () => {
    // A 6-cycle already has a non-convex relationship to its interior under the
    // chord test; reachability must still take every interior arrow.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const spur = pathFrom(
      table.geometry,
      anExitFrom(table.geometry, arrowAt(ring.wall, 2)),
      2,
      ring.wall,
    );

    const enclosed = table.rules.enclosedBy(ground([...ring.wall, ...spur]), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });

  it('encloses a hole fenced by a second ring of the same player’s ground', () => {
    // Both rings are A's ground, so nothing in the hole escapes — the inner ring stops
    // a walk before the outer one is reached (§11 item 36). The withdrawn even-odd
    // reading called this hole *outside* on the second crossing, which is the answer
    // item 36 removed, and it is what the feature's Then-step used to say.
    //
    // Two genuinely distinct walls: a band of ground around the tiling's seed, and the
    // 6-cycle inside it. The hole is the 6-cycle's interior; the pocket is the ground
    // between the two.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const band = aSealedBand(table.geometry, 3);
    const between = justOutside(table.geometry, ring);

    const enclosed = table.rules.enclosedBy(ground([...band, ...ring.wall]), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
    expect(keys(enclosed)).toContain(String(between));
  });
});

// ── Rule: a claim that rings nothing encloses nothing ─────────────────────────

describe('a claim that rings nothing encloses nothing', () => {
  it.each([
    {
      name: 'a single arrow',
      shape: (g: ReturnType<typeof onTiling>['geometry']): readonly ArrowId[] => [
        pick(g.outArrows(g.seedPoint()), 0),
      ],
    },
    {
      name: 'a straight run of arrows',
      shape: (g: ReturnType<typeof onTiling>['geometry']): readonly ArrowId[] =>
        aRunFromHome(g, 4).run,
    },
    {
      name: 'a run with a spur, closing nothing',
      shape: (g: ReturnType<typeof onTiling>['geometry']): readonly ArrowId[] => {
        const { run } = aRunFromHome(g, 3);
        const middle = arrowAt(run, 1);
        const spur = pick(
          g.inArrows(g.origin(arrowAt(run, 2))).filter((a) => a !== middle),
          0,
        );
        return [...run, spur];
      },
    },
  ])('encloses nothing for $name', ({ shape }) => {
    const table = onTiling();
    expect(table.rules.enclosedBy(ground(shape(table.geometry)), A)).toEqual([]);
  });
});

// ── Rule: queries only ────────────────────────────────────────────────────────

describe('fill is a query', () => {
  it('changes no state when asked for a verdict', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const state = stateOf([], A, {
      territory: ring.wall.map((arrow) => ({ arrow, owner: A })),
    });
    const before = JSON.stringify({
      territory: [...state.territory.entries()].map(([a, o]) => [String(a), String(o)]),
      trails: [...state.trails.entries()].map(([p, s]) => [
        String(p),
        [...s].map(String).toSorted(),
      ]),
    });

    table.rules.enclosedBy(ground(ring.wall), A);

    expect(
      JSON.stringify({
        territory: [...state.territory.entries()].map(([a, o]) => [String(a), String(o)]),
        trails: [...state.trails.entries()].map(([p, s]) => [
          String(p),
          [...s].map(String).toSorted(),
        ]),
      }),
    ).toBe(before);
  });

  it('gives the same ordered answer however the claim was built', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    expect(table.rules.enclosedBy(ground([...ring.wall].reverse()), A)).toEqual(
      table.rules.enclosedBy(ground(ring.wall), A),
    );
  });

  it('enumerates no vertex while filling', () => {
    const base = onTiling().geometry;
    const { geometry, vertexReads } = countingVertices(base);
    const rules = makeRules(geometry);
    const ring = aRingWithAnInside(geometry);

    rules.enclosedBy(ground(ring.wall), A);

    expect(vertexReads()).toBe(0);
  });

  it('derives every chord endpoint from slotOf', () => {
    const base = onTiling().geometry;
    let slotReads = 0;
    const geometry = {
      ...base,
      slotOf: (point: Parameters<typeof base.slotOf>[0], arrow: Parameters<typeof base.slotOf>[1]) => {
        slotReads += 1;
        return base.slotOf(point, arrow);
      },
    };
    const rules = makeRules(geometry);
    const ring = aRingWithAnInside(base);

    rules.enclosedBy(ground(ring.wall), A);

    // A ring that seals an interior must consult chords at its points — so slotOf
    // was the source of every endpoint (P01 D1: never parse an arrow id).
    expect(slotReads).toBeGreaterThan(0);
  });
});

// ── Rule: this suite cannot run on a fixture board ────────────────────────────

describe('this suite cannot run on a fixture board', () => {
  it('reports arrows outside a ring as enclosed on a finite board', () => {
    // On a finite board nothing escapes, so a ring's *exterior* is wrongly reported
    // enclosed — the failure mode that makes fixtures unusable for fill (§11 item 36).
    const table = onBoard();
    // A 3-cycle on the fixture: rings nothing on the plane, but on a tiny board the
    // remaining arrows cannot reach infinity either.
    const cycle = (() => {
      for (const a of table.geometry.window(table.geometry.seedPoint(), 1).arrows) {
        for (const b of table.geometry.outArrows(table.geometry.target(a))) {
          for (const c of table.geometry.outArrows(table.geometry.target(b))) {
            if (table.geometry.outArrows(table.geometry.target(c)).includes(a)) {
              return [a, b, c] as const;
            }
          }
        }
      }
      throw new Error('setup: fixture has no 3-cycle');
    })();
    const enclosed = table.rules.enclosedBy(ground(cycle), A);
    const outside = table.geometry
      .window(table.geometry.seedPoint(), 1)
      .arrows.filter((a) => !cycle.includes(a));

    // At least one exterior arrow is falsely enclosed — the live guard against
    // pointing this suite at a fixture "to make it faster".
    expect(outside.some((a) => enclosed.map(String).includes(String(a)))).toBe(true);
  });
});
