/**
 * docs/spec/fill/fill.core.feature — one test per scenario.
 *
 * **Not even-odd.** SPEC §11 item 36: a claim is bounded by the trail on one side and
 * by existing territory on the other, so it is not a closed curve to take a parity of.
 * The wall is the player's ground and the test is **reachability** — a pocket that
 * cannot reach infinity is enclosed.
 *
 * Which is why these run on the generated tiling and cannot run on a fixture: a finite
 * board has no infinity to fail to reach.
 *
 * @see docs/spec/fill/fill.md
 */

import { describe, expect, it } from 'vitest';
import {
  A,
  aRunFromHome,
  aTriangle,
  anExitFrom,
  arrowAt,
  exitsFrom,
  onTiling,
  pathFrom,
  pick,
} from './support';
import type { ArrowId } from './support';

const ground = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> => new Set(arrows);
const keys = (arrows: readonly ArrowId[]): readonly string[] =>
  arrows.map(String).toSorted();

// ── Rule: enclosed means cannot reach infinity ─────────────────────────────────

describe('enclosed means cannot reach infinity', () => {
  it('encloses nothing for a claim that is a bare strip', () => {
    // A strip has no inside. §7's land bridge, seen from fill's side.
    const table = onTiling();
    const { run } = aRunFromHome(table.geometry, 4);

    expect(table.rules.enclosedBy(ground(run), A)).toEqual([]);
  });

  it('encloses nothing for the minimal three-arrow ring', () => {
    // §11 item 16: the lattice triangle is the *minimum enclosable territory* and its
    // three arrows **are** the ring — zero tiles inside is the correct answer. §7 is
    // what makes it worth taking anyway: the spawner comes from those three bordering
    // arrows in thirds, and nothing here enumerates the vertex to find that out.
    const table = onTiling();

    expect(table.rules.enclosedBy(ground(aTriangle(table.geometry)), A)).toEqual([]);
  });

  it('encloses the pocket a ring of ground surrounds', () => {
    // The load-bearing positive case: a ring big enough to have an inside.
    const table = onTiling();
    const ring = aRingWithAnInside(table);

    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });

  it('encloses every arrow of a pocket and nothing outside it', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table);

    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    for (const arrow of enclosed) expect(ring.wall).not.toContain(arrow);
    expect(keys(enclosed)).not.toContain(String(ring.far));
  });
});

// ── Rule: a pocket does not leak at a point ────────────────────────────────────

describe('a pocket does not leak at a point', () => {
  it('does not let a walk escape between two ground arrows meeting at a point', () => {
    // **The scenario that separates this from a tile-only flood fill** (§2). If it
    // fails, every enclosure on the board leaks through the seam between two trail
    // arrows and nothing else in the suite reports it.
    const table = onTiling();
    const ring = aRingWithAnInside(table);

    // The wall is one arrow wide, so its consecutive arrows meet only at points —
    // every escape route from the inside has to transit one of them.
    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });
});

// ── Rule: a self-loop claims what it rings ────────────────────────────────────

describe('a self-loop claims what it rings', () => {
  it('encloses the loop of a claim that crosses itself', () => {
    // The consequence that decided §11 item 36. Under the withdrawn parity reading this
    // was a bare strip; under reachability the loop is ground and its inside is
    // surrounded.
    const table = onTiling();
    const ring = aRingWithAnInside(table);
    // A tail hanging off the ring: still a self-crossing claim, and the ring's inside
    // must be enclosed regardless of the tail.
    const tail = pathFrom(
      table.geometry,
      anExitFrom(table.geometry, arrowAt(ring.wall, 0)),
      2,
      ring.wall,
    );

    const enclosed = table.rules.enclosedBy(ground([...ring.wall, ...tail]), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });
});

// ── Rule: the verdict does not depend on the route ────────────────────────────

describe('the verdict does not depend on the route', () => {
  it('reports an arrow well clear of the ground as escaping', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table);

    expect(keys(table.rules.enclosedBy(ground(ring.wall), A))).not.toContain(
      String(ring.far),
    );
  });

  it('gives the same answer however the ground set was built', () => {
    // ADR 0001. The ground is a Set and the result is an ordered answer derived from
    // one, which is exactly where insertion order hides.
    const table = onTiling();
    const ring = aRingWithAnInside(table);

    const forwards = table.rules.enclosedBy(ground(ring.wall), A);
    const backwards = table.rules.enclosedBy(ground([...ring.wall].reverse()), A);

    expect(backwards).toEqual(forwards);
  });
});

// ── Rule: the sweep is bounded by the claim, not by the board ─────────────────

describe('the sweep is bounded by the claim, not by the board', () => {
  it('does not enclose an arrow many steps outside a three-arrow ring', () => {
    // §7: a claim of L arrows cannot surround more than O(L²), so the sweep is finite
    // though the board is not — and §11 item 4 means there is no extent to read.
    const table = onTiling();
    const triangle = aTriangle(table.geometry);
    const distant = arrowAt(
      pathFrom(table.geometry, pick(exitsFrom(table.geometry, arrowAt(triangle, 0)), 1), 8),
      7,
    );

    expect(keys(table.rules.enclosedBy(ground(triangle), A))).not.toContain(
      String(distant),
    );
  });
});

/**
 * A ring of arrows with at least one arrow strictly inside it, plus an arrow far
 * outside — the shape every positive fill scenario needs.
 *
 * Deliberately **not** built from a lattice coordinate: the rules core receives ids
 * from the port and passes them back (P01 D1), and a test that computed a hexagon from
 * `cellArrow` would be testing the tiling's arithmetic rather than the fill. So the
 * ring is grown through the port, and the scenario asserts against whatever it found.
 *
 * Phase 3 note: if no such ring can be grown this way, that is a *setup* failure and
 * must be reported as one — never as a fill that found nothing.
 */
const aRingWithAnInside = (
  table: ReturnType<typeof onTiling>,
): { wall: readonly ArrowId[]; inside: ArrowId; far: ArrowId } => {
  const { geometry } = table;
  const start = pick(geometry.outArrows(geometry.seedPoint()), 0);
  const exits = (a: ArrowId): readonly ArrowId[] => exitsFrom(geometry, a);

  // Girth is 3, and a 3-cycle rings nothing — its arrows *are* the triangle (§11 item
  // 16). The shortest ring with an inside is 6, which the lattice does offer, so the
  // search is for a directed cycle of exactly that length.
  const ring = ((): readonly ArrowId[] | undefined => {
    const walk = (path: readonly ArrowId[]): readonly ArrowId[] | undefined => {
      const last = arrowAt(path, path.length - 1);
      if (path.length === 6) return exits(last).includes(start) ? path : undefined;
      for (const next of exits(last)) {
        if (path.includes(next)) continue;
        const found = walk([...path, next]);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    return walk([start]);
  })();
  if (ring === undefined) {
    throw new Error('setup: the tiling offered no directed 6-cycle from its seed point');
  }

  // The ring's own inside: arrows whose two endpoints are both ring points but which are
  // not on the ring. On a 6-cycle that is the inner triangle — three arrows.
  const points = new Set(
    ring.flatMap((a) => [String(geometry.origin(a)), String(geometry.target(a))]),
  );
  const inside = [...new Set(ring.flatMap((a) => geometry.outArrows(geometry.target(a))))]
    .filter((a) => !ring.includes(a))
    .filter(
      (a) => points.has(String(geometry.origin(a))) && points.has(String(geometry.target(a))),
    )
    .toSorted((l, r) => (String(l) < String(r) ? -1 : 1));
  const first = inside[0];
  if (first === undefined) throw new Error('setup: that ring has no interior arrow');

  return {
    wall: ring,
    inside: first,
    far: arrowAt(pathFrom(geometry, start, 20, ring), 19),
  };
};
