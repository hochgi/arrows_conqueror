/**
 * How far a portion of a stack can get **this turn**, and what it costs to send.
 *
 * SPEC §3: allowance is `speed(N) = 1 + floor(log₂ N)` whole steps, so distance is
 * bought with heads — 1 head reaches one arrow, 2 reach two, 4 reach three, 8 reach
 * four. That is the most important thing about a stack and the board never said it
 * out loud; this module is what lets the renderer show it.
 *
 * **Computed by simulation, never by re-deriving the rules.** For each portion size
 * this walks the real `apply` and keeps whatever it accepted, so allowance, the branch
 * toll (§5), enemy-occupied ground (§6.2) and a closure landing mid-path (§7) are all
 * respected because the engine was asked rather than imitated. An adapter that
 * recomputed `speed()` here would drift the moment a rule moved.
 *
 * A portion travels **as a unit and does not merge on the way**: stepping onto your
 * own group merges under §3 and the portion stops being separable, so a hop onto
 * occupied ground is recorded as a destination and never extended. That is also what
 * a player means by "send these six there".
 */

import { ContractViolation, speed, step } from '@arrows/contracts';
import type { ArrowId, GameState, GeometryPort, Move, RulesPort } from '@arrows/contracts';

/** One arrow a portion could reach, and the price of reaching it. */
export interface ReachEntry {
  /** Fewest steps any accepted route took — what the fade is drawn from. */
  readonly distance: number;
  /** Fewest heads that get there this turn. `2^(distance-1)` in the open field. */
  readonly minCount: number;
  /** Most heads that get there — normally the whole stack, less if a merge bars it. */
  readonly maxCount: number;
  /** Exits to walk, per portion size. The renderer hands one back to be applied. */
  readonly plans: ReadonlyMap<number, readonly ArrowId[]>;
  /**
   * True when getting here leaves a head stuck on a join/split (§5). Painted red so
   * a lone remaining unit is not spent into the toll by accident.
   */
  readonly paysBranchToll: boolean;
}

export type Reach = ReadonlyMap<ArrowId, ReachEntry>;

/** A depth cap, so a pathological board cannot spin the renderer. */
const MAX_DEPTH = 8;

interface Mutable {
  distance: number;
  minCount: number;
  maxCount: number;
  plans: Map<number, readonly ArrowId[]>;
}

/**
 * Would taking the *whole* stack out `exit` leave a join/split unpaid?
 *
 * Asked of `apply` rather than re-derived: the mandate lives in trails, and the
 * adapter only needs the verdict for paint. Combat stay-behind and merge bars fail
 * for other reasons and must not light the toll colour.
 */
const fullStackLeavesUnpaidBranch = (
  rules: RulesPort,
  state: GameState,
  from: ArrowId,
  exit: ArrowId,
  heads: number,
): boolean => {
  try {
    rules.apply(state, step(from, exit, heads));
    return false;
  } catch (err) {
    return err instanceof ContractViolation && /\bis a (join|split) of\b/.test(err.message);
  }
};

/**
 * Every arrow the group on `from` could reach this turn, keyed by arrow.
 *
 * Portions are tried from 1 upward because *bigger is not always further*: a portion
 * that outnumbers the group it merges into is barred for the rest of the turn (§3), so
 * `minCount` and `maxCount` are both measured rather than assumed.
 */
export const reachFrom = (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  from: ArrowId,
): Reach => {
  const group = state.groups.get(from);
  if (group === undefined || group.owner !== state.activePlayer) return new Map();

  const found = new Map<ArrowId, Mutable>();
  const record = (
    arrow: ArrowId,
    distance: number,
    count: number,
    plan: readonly ArrowId[],
  ): void => {
    const seen = found.get(arrow);
    if (seen === undefined) {
      found.set(arrow, {
        distance,
        minCount: count,
        maxCount: count,
        plans: new Map([[count, plan]]),
      });
      return;
    }
    if (distance < seen.distance) seen.distance = distance;
    if (count < seen.minCount) seen.minCount = count;
    if (count > seen.maxCount) seen.maxCount = count;
    // The shortest plan for a given portion is the one worth walking.
    const best = seen.plans.get(count);
    if (best === undefined || plan.length < best.length) seen.plans.set(count, plan);
  };

  for (let count = 1; count <= group.heads; count += 1) {
    // `speed(count)` only bounds the search — the engine still decides every hop.
    const cap = Math.min(MAX_DEPTH, group.speedOverride ?? speed(count));
    const visited = new Set<string>();

    const walk = (scratch: GameState, at: ArrowId, plan: readonly ArrowId[]): void => {
      if (plan.length >= cap) return;
      const key = `${String(at)}|${String(plan.length)}`;
      if (visited.has(key)) return;
      visited.add(key);

      for (const exit of geometry.outArrows(geometry.target(at))) {
        const occupied = scratch.groups.get(exit) !== undefined;
        let next: GameState;
        try {
          next = rules.apply(scratch, step(at, exit, count));
        } catch {
          continue;
        }
        const route = [...plan, exit];
        record(exit, route.length, count, route);
        // A hop onto occupied ground merges (§3), so the portion ends there.
        if (!occupied) walk(next, exit, route);
      }
    };

    walk(state, from, []);
  }

  // Per first-exit: does emptying `from` that way leave a branch unpaid?
  const tollByExit = new Map<string, boolean>();
  const exitPaysToll = (exit: ArrowId): boolean => {
    const key = String(exit);
    const cached = tollByExit.get(key);
    if (cached !== undefined) return cached;
    const pays = fullStackLeavesUnpaidBranch(rules, state, from, exit, group.heads);
    tollByExit.set(key, pays);
    return pays;
  };

  const out = new Map<ArrowId, ReachEntry>();
  for (const [arrow, seen] of found) {
    const plan = seen.plans.get(seen.minCount);
    const first = plan?.[0];
    const paysBranchToll =
      first !== undefined &&
      seen.minCount < group.heads &&
      exitPaysToll(first);
    out.set(arrow, {
      distance: seen.distance,
      minCount: seen.minCount,
      maxCount: seen.maxCount,
      plans: seen.plans,
      paysBranchToll,
    });
  }
  return out;
};

/** The moves that carry `count` heads along a reach plan, in order. */
export const planMoves = (
  from: ArrowId,
  plan: readonly ArrowId[],
  count: number,
): readonly Move[] => {
  const moves: Move[] = [];
  let at = from;
  for (const exit of plan) {
    moves.push(step(at, exit, count));
    at = exit;
  }
  return moves;
};

/**
 * Arrows the trip will actually walk — the path the engine will apply for this
 * portion. Shown so the player can see which of several equal-length routes was
 * chosen and click an intermediate if they want another.
 */
export const planArrowSet = (plan: readonly ArrowId[]): ReadonlySet<ArrowId> =>
  new Set(plan);

/** Route for a reach destination at `count` (defaults to the cheapest trip). */
export const pathForDestination = (
  reach: Reach,
  exit: ArrowId,
  count?: number,
): ReadonlySet<ArrowId> => {
  const entry = reach.get(exit);
  if (entry === undefined) return new Set();
  const portion = count ?? entry.minCount;
  const plan = entry.plans.get(portion) ?? entry.plans.get(entry.minCount);
  return plan === undefined ? new Set() : planArrowSet(plan);
};

/**
 * How solid a reach arrow should look: nearest full, further fainter.
 *
 * The fade *is* the price. One step costs one head and four steps cost eight, so a
 * pale arrow is a arrow you can only take by committing most of the stack.
 */
export const reachOpacity = (distance: number): number =>
  Math.max(0.16, 0.62 - (distance - 1) * 0.11);
