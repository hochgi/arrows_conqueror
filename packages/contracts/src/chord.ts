/**
 * The chord test — when a traversal is a crossing.
 *
 * SPEC §2, "Trails own points, not just arrows" and "The chord test".
 *
 * A trail owns the points it passes through, not merely its arrows. Two arrows
 * touching at a single point do not form a barrier — that is the diagonal-leak
 * problem from flood fill, and under a "did you land on a trail tile" rule an
 * enemy could thread through the gap between two trail arrows without touching
 * either, making every enclosure in the game leak.
 *
 *   Blue crosses red iff their chords INTERLEAVE — blue's endpoints separate
 *   red's around the circle — or COINCIDE, meaning they share an endpoint.
 *
 * The test depends only on the cyclic order of the six slots. It never asks
 * which of them are in-slots, so it holds under any layout — including the
 * alternating one SPEC §11 item 1 settled on. That independence started as a
 * hedge against a pending measurement; it is kept because it is also what makes
 * the predicate total. A layout makes only 9 of the chords realizable as a
 * transit, but the predicate answers all **15 chords and 225 ordered pairs**,
 * which is the size any lookup-table implementation has to be.
 *
 * @see docs/spec/chord-test/chord-test.md
 */

import { reject } from './errors';
import { SLOTS } from './ids';
import type { Slot } from './ids';

/** The pair of slots a path connects when it transits a point. Unordered. */
export interface Chord {
  readonly a: Slot;
  readonly b: Slot;
}

const isSlot = (s: number): boolean => Number.isInteger(s) && s >= 0 && s < SLOTS.length;

/**
 * Construct a chord, normalized so the lower slot comes first.
 *
 * Normalizing is how "unordered" above is made true rather than merely asserted:
 * two structurally equal chords compare equal, which replay comparison and any
 * future dedup depend on.
 *
 * Throws {@link ContractViolation} on a slot outside the six, and on a chord whose
 * two ends are the same slot. A transit enters on an in-arrow and leaves on an
 * out-arrow, so its ends are always distinct — the same reason `step` refuses a
 * source and exit that match. A degenerate chord is also how "arrived but has not
 * chosen an exit" would try to represent itself, and that is not a chord at all:
 * crossing is a decision (§2), and there is nothing to test until it is made.
 */
export const chord = (a: Slot, b: Slot): Chord => {
  if (!isSlot(a) || !isSlot(b)) {
    reject(`a chord joins two of the six slots, got ${String(a)} and ${String(b)}`);
  }
  if (a === b) reject(`a chord joins two distinct slots, got ${String(a)} twice`);
  return a < b ? { a, b } : { a: b, b: a };
};

/** Do the two chords share an end — is one path's arrow the other's? */
const coincide = (blue: Chord, red: Chord): boolean =>
  blue.a === red.a || blue.a === red.b || blue.b === red.a || blue.b === red.b;

/**
 * Is `x` strictly inside the arc walked from `from` to `to` one way around?
 *
 * Pure cyclic arithmetic, which is what keeps the whole test independent of which
 * slots are in-slots — the property that let P01 land before P03 and that still
 * makes the predicate total over all 15 chords rather than the 9 a layout
 * realizes.
 */
const strictlyWithinArc = (from: Slot, x: Slot, to: Slot): boolean => {
  const n = SLOTS.length;
  for (let s = (from + 1) % n; s !== to; s = (s + 1) % n) {
    if (s === x) return true;
  }
  return false;
};

/**
 * Do `blue`'s endpoints separate `red`'s around the circle?
 *
 * The narrower half of the verdict, and the one even-odd fill needs (SPEC §7).
 * Coincidence cannot invert an enclosure: fill reads the trail's arrow *set*
 * (§6.1a invariant 2), and re-traversing an arrow the trail already holds leaves
 * that set unchanged. A fill written against `chordsCross` would invert on a
 * lagging group walking ground it already owns, which is ordinary play.
 */
export const chordsInterleave = (blue: Chord, red: Chord): boolean => {
  // Sharing an end is coincidence, never interleaving. Without this guard the arc
  // test below reports a spurious interleave whenever the shared end sits outside
  // the arc and the other end inside it — which would make even-odd fill invert on
  // a lagging group walking ground it already owns (§6.1a).
  if (coincide(blue, red)) return false;
  return (
    strictlyWithinArc(red.a, blue.a, red.b) !== strictlyWithinArc(red.a, blue.b, red.b)
  );
};

/**
 * Does `blue` cross `red`? Interleave OR coincide.
 *
 * What §6.1's cut check and §6.2's combat location both want: an enemy landing
 * on your arrow is as much a crossing as one threading between two of them.
 *
 * Symmetric by construction — interleaving and coincidence are both symmetric
 * relations, and a verdict that changed with argument order would make combat
 * depend on which trail the engine happened to examine first. That is the
 * iteration-order determinism failure ADR 0001 names as the realistic one.
 *
 * This is `chordsInterleave` widened by coincidence and must never disagree with
 * it — asserted, not assumed.
 */
export const chordsCross = (blue: Chord, red: Chord): boolean =>
  chordsInterleave(blue, red) || coincide(blue, red);
