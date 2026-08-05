/**
 * Trails, branch anchors and crossings — **skeleton only.**
 *
 * SPEC §5 (the safety rule, branching costs an anchor), §6.1a (a trail is a set,
 * all-to-all points), §6.1 (the two grades of anchor), §2 (the chord test).
 * P05 decisions D1–D9.
 *
 * Phase 2 lands the signatures and nothing else. Every function here throws a
 * **plain `Error`**, deliberately: the refusal tests assert
 * `toThrow(ContractViolation)`, so a stub that threw *that* type would go falsely
 * green and the suite would report a passing rule that does not exist. Phase 3
 * replaces these bodies; it must not retype the throw as a shortcut.
 *
 * Purity applies from the first line: no clock, no randomness, no I/O, no mutation
 * of an input state. The realistic risk here is not `Math.random` but **iteration
 * order** — a trail is a `Set` and a chord list is an ordered answer derived from
 * one, which is the exact shape ADR 0001 warns about. Every ordered result must be
 * sorted on a total key.
 *
 * @see docs/spec/trails/trails.md
 * @see docs/spec/crossings/crossings.md
 */

import type {
  AnchorGrade,
  ArrowId,
  Chord,
  GameState,
  GeometryPort,
  PlayerId,
  PointId,
  StepMove,
  Traversal,
} from '@arrows/contracts';

const unimplemented = (): never => {
  throw new Error('not implemented');
};

/** The four `RulesPort` methods P05 adds, plus the two hooks `apply` needs. */
export interface TrailRules {
  /**
   * The trail after a step has landed: the destination is marked unless it is
   * already the mover's own territory (§5, P05 D3).
   */
  readonly markStep: (state: GameState, move: StepMove, mover: PlayerId) => GameState['trails'];
  /**
   * Refuse a step that creates an unpaid branch, or strips the anchor off a branch
   * it is stepping away from (§5, P05 D6).
   *
   * Local to what the move changes, never a standing invariant over the trail —
   * damage can legally empty a branch point, and a whole-trail check would make
   * every later move illegal.
   *
   * @throws ContractViolation naming the branch that went unpaid.
   */
  readonly requireBranchAnchors: (state: GameState, move: StepMove, mover: PlayerId) => void;
  readonly trailChordsAt: (
    state: GameState,
    point: PointId,
    player: PlayerId,
  ) => readonly Chord[];
  readonly crossesTrail: (state: GameState, traversal: Traversal, victim: PlayerId) => boolean;
  readonly selfCrosses: (state: GameState, traversal: Traversal, mover: PlayerId) => boolean;
  readonly anchorGrade: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade;
}

/**
 * Build the trail rules over a board.
 *
 * The board arrives as a `GeometryPort` and nothing else, so `slotOf` is asked for
 * every chord endpoint rather than inferred from an arrow id — which is the one
 * thing that would pass on the generated tiling and fail on a fixture.
 */
export const makeTrailRules = (_geometry: GeometryPort): TrailRules => ({
  markStep: unimplemented,
  requireBranchAnchors: unimplemented,
  trailChordsAt: unimplemented,
  crossesTrail: unimplemented,
  selfCrosses: unimplemented,
  anchorGrade: unimplemented,
});
