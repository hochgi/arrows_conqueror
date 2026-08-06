/**
 * The EARS invariants of docs/spec/fill/fill.md, as properties.
 *
 * On the generated tiling only — *enclosed* means cannot reach infinity.
 *
 * @see docs/spec/fill/fill.md — "Invariants"
 */

import { describe, expect, it } from 'vitest';
import { makeRules } from '../src/index';
import {
  A,
  aRingWithAnInside,
  aRunFromHome,
  aTriangle,
  anExitFrom,
  arrowAt,
  countingVertices,
  onTiling,
  pathFrom,
  pick,
} from './support';
import type { ArrowId } from './support';

const ground = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> => new Set(arrows);
const keys = (arrows: readonly ArrowId[]): readonly string[] =>
  arrows.map(String).toSorted();

describe('enclosed means no escaping walk over non-territory', () => {
  it('reports a ringed arrow enclosed and a clear arrow escaping', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
    expect(keys(enclosed)).not.toContain(String(ring.far));
  });

  it('reports nothing enclosed for a claim that rings nothing', () => {
    const table = onTiling();
    expect(table.rules.enclosedBy(ground(aRunFromHome(table.geometry, 4).run), A)).toEqual(
      [],
    );
    expect(table.rules.enclosedBy(ground(aTriangle(table.geometry)), A)).toEqual([]);
  });

  it('blocks a walk that interleaves with a ground chord at a shared point', () => {
    // Without the chord block every enclosure leaks (§2). The positive ring case
    // is exactly that: the interior's only exits transit wall points.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    expect(keys(table.rules.enclosedBy(ground(ring.wall), A))).toContain(
      String(ring.inside),
    );
  });
});

describe('the verdict is route-independent and order-independent', () => {
  it('agrees for opposite insertion orders of the same ground', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    expect(table.rules.enclosedBy(ground([...ring.wall].reverse()), A)).toEqual(
      table.rules.enclosedBy(ground(ring.wall), A),
    );
  });

  it('still encloses when extra ground is added that does not open an escape', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const spur = anExitFrom(table.geometry, arrowAt(ring.wall, 0));

    expect(keys(table.rules.enclosedBy(ground([...ring.wall, spur]), A))).toContain(
      String(ring.inside),
    );
  });
});

describe('the sweep is bounded by the claim and touches no vertex', () => {
  it('does not examine a far arrow into enclosure for a small claim', () => {
    const table = onTiling();
    const triangle = aTriangle(table.geometry);
    const distant = arrowAt(
      pathFrom(table.geometry, pick(table.geometry.outArrows(table.geometry.target(arrowAt(triangle, 0))), 0), 8),
      7,
    );

    expect(keys(table.rules.enclosedBy(ground(triangle), A))).not.toContain(
      String(distant),
    );
  });

  it('enumerates no vertex and reads chords only through slotOf', () => {
    const base = onTiling().geometry;
    const { geometry, vertexReads } = countingVertices(base);
    let slotReads = 0;
    const tracked = {
      ...geometry,
      slotOf: (
        point: Parameters<typeof geometry.slotOf>[0],
        arrow: Parameters<typeof geometry.slotOf>[1],
      ) => {
        slotReads += 1;
        return geometry.slotOf(point, arrow);
      },
    };
    const rules = makeRules(tracked);
    const ring = aRingWithAnInside(base);

    rules.enclosedBy(ground(ring.wall), A);

    expect(vertexReads()).toBe(0);
    expect(slotReads).toBeGreaterThan(0);
  });
});
