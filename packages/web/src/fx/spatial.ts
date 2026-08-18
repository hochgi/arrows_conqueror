/**
 * Spatial ordering for effects — "outward from here", over a set of arrows.
 *
 * Presentation only. Every effect in this layer is *spatially anchored*: a capture
 * fills from the arrow that closed the loop, an evaporation burns from the cut
 * point, a loss retracts from where it was taken. That is the difference between an
 * animation that explains a cause and one that is merely decoration, and it needs
 * exactly one thing the layout cannot give: how far each arrow is from the origin,
 * *through the affected region* rather than across the screen.
 *
 * Undirected adjacency on purpose. Grain decides movement; it does not decide what
 * looks contiguous, and a fill that skipped every against-the-grain neighbour would
 * read as holes rather than as a region.
 */

import type { ArrowId, GeometryPort } from '@conquarrow/contracts';

const key = (arrow: ArrowId): string => String(arrow);

/** Arrows sharing a point with this one, either direction, in id order. */
export const undirectedNeighbours = (
  geometry: GeometryPort,
  arrow: ArrowId,
): readonly ArrowId[] => {
  const out: ArrowId[] = [];
  const seen = new Set<string>([key(arrow)]);
  for (const point of [geometry.origin(arrow), geometry.target(arrow)]) {
    for (const n of [...geometry.inArrows(point), ...geometry.outArrows(point)]) {
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
  }
  return out.toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
};

/**
 * Ring index per member: 0 at the seed, +1 per undirected hop *inside* `members`.
 *
 * Members BFS cannot reach — a fragment on the far side of something, or a claim
 * whose anchor is not part of it — land one ring past the furthest reached one, so
 * they animate last together instead of not at all.
 */
export const ringsFrom = (
  geometry: GeometryPort,
  seed: ArrowId | undefined,
  members: readonly ArrowId[],
): ReadonlyMap<string, number> => {
  const rings = new Map<string, number>();
  if (members.length === 0) return rings;
  const inRegion = new Set(members.map(key));

  // Start at the seed when it is part of the region; otherwise at whichever
  // members touch it; otherwise at the lowest id, so the order never depends on
  // which arrow happened to be enumerated first.
  const frontier: ArrowId[] = [];
  if (seed !== undefined && inRegion.has(key(seed))) {
    frontier.push(seed);
  } else if (seed !== undefined) {
    const touching = new Set(undirectedNeighbours(geometry, seed).map(key));
    for (const m of members) if (touching.has(key(m))) frontier.push(m);
  }
  if (frontier.length === 0) {
    const first = members.toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))[0];
    if (first !== undefined) frontier.push(first);
  }
  for (const start of frontier) rings.set(key(start), 0);

  for (let i = 0; i < frontier.length; i += 1) {
    const cur = frontier[i];
    if (cur === undefined) continue;
    const d = rings.get(key(cur)) ?? 0;
    for (const n of undirectedNeighbours(geometry, cur)) {
      const k = key(n);
      if (!inRegion.has(k) || rings.has(k)) continue;
      rings.set(k, d + 1);
      frontier.push(n);
    }
  }

  let max = 0;
  for (const d of rings.values()) max = Math.max(max, d);
  for (const m of members) if (!rings.has(key(m))) rings.set(key(m), max + 1);
  return rings;
};

/**
 * The members that touch something outside the region — its outline.
 *
 * Marking a whole captured area tile by tile is a lot of ink for one fact: rimming
 * forty tiles reads as forty separate events rather than as one region. The outline
 * says "this area, and it is new" with a fraction of the marks, and it scales — a
 * large claim's border grows far slower than its area.
 */
export const borderOf = (
  geometry: GeometryPort,
  members: readonly ArrowId[],
): readonly ArrowId[] => {
  const inRegion = new Set(members.map(key));
  const border: ArrowId[] = [];
  for (const member of members) {
    const outside = undirectedNeighbours(geometry, member).some((n) => !inRegion.has(key(n)));
    if (outside) border.push(member);
  }
  // A region with no outside — impossible on an unbounded board, but a fixture or a
  // single tile could produce it — falls back to the whole thing rather than to
  // nothing, because an unmarked capture is worse than an over-marked one.
  return border.length === 0 ? members : border;
};

/** `ringsFrom`, already turned into per-cell delays with a ceiling. */
export const staggerFrom = (
  geometry: GeometryPort | undefined,
  seed: ArrowId | undefined,
  members: readonly ArrowId[],
  stepMs: number,
  capMs: number,
): ReadonlyMap<string, number> => {
  const out = new Map<string, number>();
  if (geometry === undefined) {
    // No board to walk: everything lands at once rather than in an invented order.
    for (const m of members) out.set(key(m), 0);
    return out;
  }
  const rings = ringsFrom(geometry, seed, members);
  for (const m of members) {
    out.set(key(m), Math.min((rings.get(key(m)) ?? 0) * stepMs, capMs));
  }
  return out;
};
