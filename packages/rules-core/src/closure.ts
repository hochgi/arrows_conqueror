/**
 * Closure and fill — **skeleton only.**
 *
 * SPEC §7 (closure, *which arrows the landing claims*, the land bridge, the pincer,
 * territory is contestable), §6.1a (a trail is a set, all-to-all points), §2 (the
 * chord test), §11 items 16, 34, 36. P05b decisions D1–D9.
 *
 * Phase 2 lands the signatures and nothing else. Every function here throws a
 * **plain `Error`**, deliberately: the refusal tests assert
 * `toThrow(ContractViolation)`, so a stub that threw *that* type would go falsely
 * green and the suite would report a passing rule that does not exist. Phase 3
 * replaces these bodies; it must not retype the throw as a shortcut.
 *
 * Two passes, and keeping them apart is the point (§11 item 36):
 *
 * 1. **The claim** — follow the trail backwards along the grain from the closing
 *    arrow until territory, or until an arrow with no trail predecessor (the stack
 *    anchor the trail starts from). Everything reached is claimed; nothing
 *    downstream is, which is what leaves a fork's other arm open.
 * 2. **The pocket** — with the path now the player's ground, any arrow from which no
 *    walk escapes is enclosed. **Not even-odd.** A claim is bounded by the trail on
 *    one side and by existing territory on the other, so it is not a closed curve to
 *    take a parity of; item 36 has the whole argument.
 *
 * Purity applies from the first line. The realistic risk here is not `Math.random`
 * but **iteration order**: the claim and the pocket are both ordered answers derived
 * from a `Set`, and the sweep enumerates a `window()` as well. Every returned list is
 * sorted on a total key.
 *
 * Nothing here enumerates a vertex. A special's ownership is a *reading* of its three
 * bordering arrows (§7, §11 item 34), so a fill that touched one would be a second
 * copy of a fact it is supposed to derive.
 *
 * @see docs/spec/closure/closure.md
 * @see docs/spec/fill/fill.md
 */

import type {
  ArrowId,
  Claim,
  GameState,
  GeometryPort,
  Move,
  PlayerId,
} from '@arrows/contracts';

const unimplemented = (): never => {
  throw new Error('not implemented');
};

/** The two `RulesPort` methods P05b adds, plus the hook `apply` needs. */
export interface ClosureRules {
  /**
   * What a closing step would claim, or `undefined` when the step is not a closure
   * (§7, D1–D3).
   */
  readonly closureOf: (state: GameState, move: Move, mover: PlayerId) => Claim | undefined;
  /**
   * The arrows a player's ground rings — every arrow from which no walk escapes
   * (§7, §11 item 36, D4).
   */
  readonly enclosedBy: (
    ground: ReadonlySet<ArrowId>,
    player: PlayerId,
  ) => readonly ArrowId[];
  /**
   * The state after a closure has been committed: territory gains the claim, and the
   * claiming player's trail loses it (D6, D7).
   *
   * Returns the state unchanged when the step is not a closure, so `apply` can call it
   * unconditionally and the non-closure path stays a single expression.
   */
  readonly commit: (state: GameState, move: Move, mover: PlayerId) => GameState;
}

/**
 * Build the closure rules over a board.
 *
 * The board arrives as a `GeometryPort` and nothing else. `window()` is the only way
 * to enumerate a bounded region of an unbounded lattice (§11 item 4), and the radius
 * the sweep uses must be **derived from the claim** with its bound stated in one place
 * — a window one step too small does not crash, it reports a ringed pocket as
 * escaping, which is this packet's whole failure mode.
 */
export const makeClosureRules = (_geometry: GeometryPort): ClosureRules => ({
  closureOf: unimplemented,
  enclosedBy: unimplemented,
  /**
   * **Phase-2 passthrough, and the one stub here that does not throw.**
   *
   * `apply` calls this on every step, so a throwing stub would fail all 143 P04 and
   * P05 tests — a red suite must leave the packets it builds on green. Returning the
   * state untouched is the honest no-op: the closure scenarios then go red on their own
   * assertions (no territory was claimed, no trail was emptied) rather than on a stack
   * trace, which is what they should be asserting anyway.
   *
   * Phase 3 replaces this. If it is forgotten, thirteen closure tests say so.
   */
  commit: (state: GameState): GameState => state,
});
