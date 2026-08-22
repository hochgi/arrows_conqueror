/**
 * The total orders the engine sorts on.
 *
 * ADR 0001 names **iteration order**, not randomness, as the realistic
 * determinism failure here, and both places it hides in this package — the group
 * map that `legalMoves` reads and the trail `Set` that chord extraction and
 * marking read — need the same comparator. One copy, so the two cannot drift.
 *
 * The comparator is **total**: it orders on the identifier's string form and
 * never on object identity or insertion luck, which is the tie-break the skill
 * warns about. Identifiers are opaque (P01 D1) — this compares them, it does not
 * parse them.
 */

import type { ArrowId, PlayerId, VertexId } from '@conquarrow/contracts';

/** A total order on arrows, so an ordered answer never rests on map or set order. */
export const compareArrows = (left: ArrowId, right: ArrowId): number => {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
};

/** Same total order for seats (P40 birth-cut victim order). */
export const comparePlayers = (left: PlayerId, right: PlayerId): number => {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
};

/** Same total order for spawner vertices (P08 round-robin / tick order). */
export const compareVertices = (left: VertexId, right: VertexId): number => {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
};
