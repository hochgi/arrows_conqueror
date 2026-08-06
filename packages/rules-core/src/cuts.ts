/**
 * Cuts and evaporation — bidirectional fire from a crossing.
 *
 * SPEC §6.1 (cutting a trail), §6.1a (all-to-all, headless trail), §2 (chord
 * test), §11 items 24, 26, 27, 28. P06 decisions D1–D4, D6–D9.
 *
 * A cut is an ordinary step whose traversal crosses a victim's trail
 * (`chordsCross`). Evaporation runs both ways from the cut point, one kill per
 * front, halt per arrow, territory is a wall. Survivors demote via the existing
 * `anchorGrade` reading (territory-side region gone → stack grade). Conversion of
 * standing heads on demoted fragments is P07 — not this module.
 *
 * @see docs/spec/cuts/cuts.md
 */

import { chord, chordsCross } from '@arrows/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Group,
  Move,
  PlayerId,
  PointId,
  StepMove,
} from '@arrows/contracts';
import { compareArrows } from './order';

/** The hook `apply` needs after a step (and after combat, when both apply). */
export interface CutRules {
  /**
   * The state after any cut this step caused has been resolved.
   *
   * Returns the state unchanged when the step's traversal crosses no enemy trail,
   * so `apply` can call it unconditionally.
   *
   * Order with combat (D6): when the same step is also contact combat, `apply`
   * resolves combat first and hands this the post-combat state — trail is
   * independent of heads (§6.1a).
   */
  readonly evaporate: (state: GameState, move: Move, mover: PlayerId) => GameState;
}

type Direction = 'forward' | 'backward';

interface Front {
  readonly arrow: ArrowId;
  readonly direction: Direction;
  /** Whether this front still carries its one kill. */
  readonly hasKill: boolean;
}

/** A trail set rebuilt in arrow-id order — iteration order is observable (D8). */
const canonical = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> =>
  new Set([...new Set(arrows)].toSorted(compareArrows));

/**
 * Build the cut rules over a board.
 *
 * The board arrives as a `GeometryPort` and nothing else — evaporation walks the
 * trail set along the grain, and every arrow relationship is asked of the port.
 */
export const makeCutRules = (geometry: GeometryPort): CutRules => {
  const trailOuts = (point: PointId, trail: ReadonlySet<ArrowId>): readonly ArrowId[] =>
    geometry.outArrows(point).filter((a) => trail.has(a));

  const trailIns = (point: PointId, trail: ReadonlySet<ArrowId>): readonly ArrowId[] =>
    geometry.inArrows(point).filter((a) => trail.has(a));

  /**
   * Continuations ahead of a front that just finished with `arrow`.
   *
   * Forward walks with the grain (outs of `target`); backward against it (ins of
   * `origin`). Sorted so equal inputs yield equal removal order (D8).
   */
  const continuations = (
    arrow: ArrowId,
    direction: Direction,
    trail: ReadonlySet<ArrowId>,
  ): readonly ArrowId[] => {
    const next =
      direction === 'forward'
        ? trailOuts(geometry.target(arrow), trail)
        : trailIns(geometry.origin(arrow), trail);
    return [...next].toSorted(compareArrows);
  };

  /**
   * Does this step's traversal cross `victim`'s trail at the cut point?
   *
   * Same predicate as `RulesPort.crossesTrail` (`chordsCross` against every trail
   * chord). Inlined so this module does not depend on `makeTrailRules`.
   */
  const trailCrosses = (state: GameState, move: StepMove, victim: PlayerId): boolean => {
    const victimTrail = state.trails.get(victim);
    if (victimTrail === undefined || victimTrail.size === 0) return false;
    const point = geometry.target(move.from);
    if (!geometry.outArrows(point).includes(move.exit)) return false;
    const drawn = chord(geometry.slotOf(point, move.from), geometry.slotOf(point, move.exit));
    const ins = geometry.inArrows(point).filter((a) => victimTrail.has(a));
    const outs = geometry.outArrows(point).filter((a) => victimTrail.has(a));
    return ins.some((into) =>
      outs.some((out) =>
        chordsCross(drawn, chord(geometry.slotOf(point, into), geometry.slotOf(point, out))),
      ),
    );
  };

  /**
   * Evaporate one victim's trail from the cut point of `move`.
   *
   * Mutates only the working copies of `groups` and the victim's trail set —
   * never the input state.
   */
  const evaporateVictim = (
    state: GameState,
    move: StepMove,
    victim: PlayerId,
    groups: Map<ArrowId, Group>,
    trail: Set<ArrowId>,
  ): void => {
    const cutPoint = geometry.target(move.from);
    const queue: Front[] = [];

    const enqueue = (arrow: ArrowId, direction: Direction, hasKill: boolean): void => {
      if (!trail.has(arrow)) return;
      queue.push({ arrow, direction, hasKill });
    };

    for (const out of [...trailOuts(cutPoint, trail)].toSorted(compareArrows)) {
      enqueue(out, 'forward', true);
    }
    for (const into of [...trailIns(cutPoint, trail)].toSorted(compareArrows)) {
      enqueue(into, 'backward', true);
    }

    // One pass per (arrow, direction) — a second arrival would double-spend kills.
    const seen = new Set<string>();
    const markSeen = (arrow: ArrowId, direction: Direction): boolean => {
      const key = `${direction}:${String(arrow)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };

    while (queue.length > 0) {
      const front = queue.shift();
      if (front === undefined) break;
      const { arrow, direction, hasKill } = front;
      if (!trail.has(arrow)) continue;
      if (!markSeen(arrow, direction)) continue;

      // Territory is a wall — stop and destroy nothing further (§6.1).
      if (state.territory.get(arrow) === victim) continue;

      const standing = groups.get(arrow);
      const heads =
        standing !== undefined && standing.owner === victim ? standing.heads : 0;

      let killLeft = hasKill;
      let halt = false;

      if (heads > 0 && standing !== undefined) {
        if (killLeft) {
          // Spend the kill on the first head.
          const remaining = heads - 1;
          killLeft = false;
          if (remaining === 0) {
            groups.delete(arrow);
          } else {
            groups.set(arrow, { ...standing, heads: remaining });
          }
          // A second head on the same arrow is the firebreak — halt here.
          if (remaining >= 1) halt = true;
        } else {
          // Kill already spent: the next head halts the front.
          halt = true;
        }
      }

      if (halt) continue;

      // Destroy this trail arrow and spread into every continuation.
      trail.delete(arrow);
      for (const next of continuations(arrow, direction, trail)) {
        enqueue(next, direction, killLeft);
      }
    }
  };

  const evaporate = (state: GameState, move: Move, mover: PlayerId): GameState => {
    if (move.kind !== 'step') return state;

    const victims = state.players.filter(
      (player) => player !== mover && trailCrosses(state, move, player),
    );
    if (victims.length === 0) return state;

    const groups = new Map(state.groups);
    const trails = new Map<PlayerId, ReadonlySet<ArrowId>>();
    for (const [player, arrows] of state.trails) {
      trails.set(player, arrows);
    }

    for (const victim of victims) {
      const current = trails.get(victim);
      if (current === undefined) continue;
      const working = new Set(current);
      evaporateVictim(state, move, victim, groups, working);
      trails.set(victim, canonical([...working]));
    }

    return { ...state, groups, trails };
  };

  return { evaporate };
};
