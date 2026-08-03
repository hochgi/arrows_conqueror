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
 * which of them are in-slots, so it is correct under either candidate
 * orientation pattern (SPEC §11 item 1) and P03 cannot invalidate it.
 *
 * SKELETON — phase 2. Phase 3 implements it, and a lookup table is a legitimate
 * implementation: there are only 15 distinct chords and 225 ordered pairs.
 *
 * @see docs/spec/chord-test/chord-test.md
 */

import type { Slot } from './ids';

/** The pair of slots a path connects when it transits a point. Unordered. */
export interface Chord {
  readonly a: Slot;
  readonly b: Slot;
}

export const chord = (a: Slot, b: Slot): Chord => ({ a, b });

/**
 * Do `blue`'s endpoints separate `red`'s around the circle?
 *
 * The narrower half of the verdict, and the one even-odd fill needs (SPEC §7).
 * Coincidence cannot invert an enclosure: fill reads the trail's arrow *set*
 * (§6.1a invariant 2), and re-traversing an arrow the trail already holds leaves
 * that set unchanged. A fill written against `chordsCross` would invert on a
 * lagging group walking ground it already owns, which is ordinary play.
 */
export const chordsInterleave = (_blue: Chord, _red: Chord): boolean => {
  throw new Error('not implemented: chordsInterleave');
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
export const chordsCross = (_blue: Chord, _red: Chord): boolean => {
  throw new Error('not implemented: chordsCross');
};
