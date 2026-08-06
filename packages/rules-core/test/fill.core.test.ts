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
import { makeRules } from '../src/index';
import {
  A,
  aDistantHolding,
  aRingWithAnInside,
  aRunFromHome,
  aSealedBand,
  aTriangle,
  anArrowWithNoRouteOut,
  anExitFrom,
  arrowAt,
  exitsFrom,
  justOutside,
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
    const ring = aRingWithAnInside(table.geometry);

    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });

  it('encloses every arrow of a pocket and nothing outside it', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    for (const arrow of enclosed) expect(ring.wall).not.toContain(arrow);
    expect(keys(enclosed)).not.toContain(String(ring.far));
  });
});

// ── Rule: a pocket does not leak at a point ────────────────────────────────────

describe('a pocket does not leak at a point', () => {
  it('lets a walk pass a ground point it does not cross', () => {
    // §2's other half: a chord that stays on one side is turning aside rather than
    // through. An arrow that touches the ring's points from outside must still escape —
    // if every transit at a wall point were blocked, the ring would seal its outside in
    // along with its pocket and no other scenario here would notice.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const outside = justOutside(table.geometry, ring);

    const enclosed = table.rules.enclosedBy(ground(ring.wall), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
    expect(keys(enclosed)).not.toContain(String(outside));
  });

  it('does not let a walk escape between two ground arrows meeting at a point', () => {
    // **The scenario that separates this from a tile-only flood fill** (§2). If it
    // fails, every enclosure on the board leaks through the seam between two trail
    // arrows and nothing else in the suite reports it.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

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
    const ring = aRingWithAnInside(table.geometry);
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

  it('encloses the core when two separate rings surround it', () => {
    // **The shape that told the two readings apart** (§11 item 36). Parity called this
    // core *outside* — two crossings, even — and reachability calls it surrounded, which
    // is what a player would predict. Re-walking one ring cannot produce the shape (a
    // trail is a set, §6.1a invariant 2), so the two loops are genuinely distinct: the
    // 6-cycle, and a band of ground around it that no walk crosses.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const band = aSealedBand(table.geometry, 3);

    const enclosed = table.rules.enclosedBy(ground([...ring.wall, ...band]), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });
});

// ── Rule: the verdict does not depend on the route ────────────────────────────

describe('the verdict does not depend on the route', () => {
  it('reports an arrow well clear of the ground as escaping', () => {
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    expect(keys(table.rules.enclosedBy(ground(ring.wall), A))).not.toContain(
      String(ring.far),
    );
  });

  it('encloses an arrow with no route out at all', () => {
    // Saturation is impassable by arithmetic: every slot at both of the arrow's points
    // belongs to the ground, so no walk can transit and *enclosed* needed no rule.
    const table = onTiling();
    const sealed = anArrowWithNoRouteOut(table.geometry);

    const enclosed = table.rules.enclosedBy(ground(sealed.wall), A);

    expect(keys(enclosed)).toContain(String(sealed.arrow));
  });

  it('gives the same answer however the ground set was built', () => {
    // ADR 0001. The ground is a Set and the result is an ordered answer derived from
    // one, which is exactly where insertion order hides.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);

    const forwards = table.rules.enclosedBy(ground(ring.wall), A);
    const backwards = table.rules.enclosedBy(ground([...ring.wall].reverse()), A);

    expect(backwards).toEqual(forwards);
  });
});

// ── Rule: the sweep is bounded by the claim, not by the board ─────────────────

describe('the sweep is bounded by the claim, not by the board', () => {
  it('looks no further than the ring can reach, and reads no board extent', () => {
    // §7: a closed run of L arrows cannot surround more than O(L²). `window` is the only
    // method that enumerates anything, so every radius it is asked for is the bound —
    // and there is no board extent to read instead (§11 item 4).
    const base = onTiling().geometry;
    const radii: number[] = [];
    const geometry = {
      ...base,
      window: (
        centre: Parameters<typeof base.window>[0],
        radius: Parameters<typeof base.window>[1],
      ) => {
        radii.push(radius);
        return base.window(centre, radius);
      },
    };
    const ring = aRingWithAnInside(base);

    makeRules(geometry).enclosedBy(ground(ring.wall), A);

    expect(radii.length).toBeGreaterThan(0);
    for (const radius of radii) expect(radius).toBeLessThanOrEqual(2 * ring.wall.length);
  });


  it('still encloses the pocket when the player also holds ground far away', () => {
    // §7: the sweep is bounded by the claim's own extent, and a holding on the other
    // side of the board is not part of it. **Regression:** one window for the whole of
    // the player's ground, centred on whichever arrow sorted first, put the sweep
    // nowhere near the closure — and a plainly ringed pocket read as escaping, which is
    // a wrong answer rather than a crash (fill.md).
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const elsewhere = aDistantHolding(table.geometry, ring.wall);

    const enclosed = table.rules.enclosedBy(ground([...ring.wall, elsewhere]), A);

    expect(keys(enclosed)).toContain(String(ring.inside));
  });

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
