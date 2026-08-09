/**
 * Cuts and evaporation — bidirectional fire from a crossing (P12).
 *
 * SPEC §6.1: fronts destroy trail until they would enter an occupied arrow;
 * that arrow and its stack survive. No kills. Territory is a wall. Orphan
 * dormant components are scrubbed. Wipe and territory-root cuts share
 * `evaporateFrom`.
 *
 * @see docs/spec/cuts/cuts.md
 * @see docs/design/packets/P12-trail-fire-anchors.md
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

export interface CutRules {
  /**
   * Resolve crossing cuts for this step (and nothing else).
   * Call after combat + mark; root-feeder cuts are separate.
   */
  readonly evaporate: (state: GameState, move: Move, mover: PlayerId) => GameState;

  /**
   * Evaporate `victim`'s trail from `cutPoint` both ways under the halt-at-first
   * rule. Used for crossings and territory-root cuts.
   */
  readonly evaporateFrom: (
    state: GameState,
    victim: PlayerId,
    cutPoint: PointId,
  ) => GameState;

  /**
   * Evaporate from an emptied trail arrow (combat wipe): destroy that arrow if
   * present, then run both ways under the halt-at-first rule.
   */
  readonly evaporateFromArrow: (
    state: GameState,
    victim: PlayerId,
    emptied: ArrowId,
  ) => GameState;

  /**
   * Drop every dormant trail component for every player (P13).
   * Used after claims punch holes in enemy trails.
   */
  readonly scrubDormantTrails: (state: GameState) => GameState;

  /**
   * After `mover` marked `marked`, if that was the last clean territory feeder
   * into a victim trail root, evaporate that victim from the root point.
   */
  readonly territoryRootCuts: (
    state: GameState,
    mover: PlayerId,
    marked: ArrowId,
  ) => GameState;
}

type Direction = 'forward' | 'backward';

interface Front {
  readonly arrow: ArrowId;
  readonly direction: Direction;
}

const canonical = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> =>
  new Set([...new Set(arrows)].toSorted(compareArrows));

export const makeCutRules = (geometry: GeometryPort): CutRules => {
  const trailOuts = (point: PointId, trail: ReadonlySet<ArrowId>): readonly ArrowId[] =>
    geometry.outArrows(point).filter((a) => trail.has(a));

  const trailIns = (point: PointId, trail: ReadonlySet<ArrowId>): readonly ArrowId[] =>
    geometry.inArrows(point).filter((a) => trail.has(a));

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

  /** Does this trail arrow's component reach owner territory or an owner stack? */
  const componentAnchored = (
    state: GameState,
    groups: ReadonlyMap<ArrowId, Group>,
    trail: ReadonlySet<ArrowId>,
    start: ArrowId,
    owner: PlayerId,
  ): boolean => {
    const seen = new Set<ArrowId>([start]);
    const pending: ArrowId[] = [start];
    for (let here = pending.pop(); here !== undefined; here = pending.pop()) {
      if (state.territory.get(here) === owner) return true;
      const behind = geometry.origin(here);
      if (geometry.inArrows(behind).some((a) => state.territory.get(a) === owner)) {
        return true;
      }
      if (groups.get(here)?.owner === owner) return true;
      for (const point of [behind, geometry.target(here)]) {
        for (const next of [...geometry.inArrows(point), ...geometry.outArrows(point)]) {
          if (!trail.has(next) || seen.has(next)) continue;
          seen.add(next);
          pending.push(next);
        }
      }
    }
    return false;
  };

  /** Drop every trail arrow whose component is dormant. */
  const scrubDormant = (
    state: GameState,
    groups: Map<ArrowId, Group>,
    trail: Set<ArrowId>,
    owner: PlayerId,
  ): void => {
    const doomed = new Set<ArrowId>();
    for (const arrow of [...trail].toSorted(compareArrows)) {
      if (doomed.has(arrow)) continue;
      if (componentAnchored(state, groups, trail, arrow, owner)) continue;
      // Collect the whole unanchored component.
      const seen = new Set<ArrowId>([arrow]);
      const pending: ArrowId[] = [arrow];
      for (let here = pending.pop(); here !== undefined; here = pending.pop()) {
        doomed.add(here);
        for (const point of [geometry.origin(here), geometry.target(here)]) {
          for (const next of [...geometry.inArrows(point), ...geometry.outArrows(point)]) {
            if (!trail.has(next) || seen.has(next)) continue;
            seen.add(next);
            pending.push(next);
          }
        }
      }
    }
    for (const arrow of doomed) trail.delete(arrow);
  };

  const runFronts = (
    state: GameState,
    victim: PlayerId,
    groups: Map<ArrowId, Group>,
    trail: Set<ArrowId>,
    seed: readonly Front[],
  ): void => {
    const queue: Front[] = [...seed];
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
      const { arrow, direction } = front;
      if (!trail.has(arrow)) continue;
      if (!markSeen(arrow, direction)) continue;

      if (state.territory.get(arrow) === victim) continue;

      const standing = groups.get(arrow);
      if (standing !== undefined && standing.owner === victim && standing.heads > 0) {
        continue;
      }

      trail.delete(arrow);
      for (const next of continuations(arrow, direction, trail)) {
        queue.push({ arrow: next, direction });
      }
    }

    scrubDormant(state, groups, trail, victim);
  };

  const evaporateAtPoint = (
    state: GameState,
    victim: PlayerId,
    cutPoint: PointId,
    groups: Map<ArrowId, Group>,
    trail: Set<ArrowId>,
  ): void => {
    const seed: Front[] = [];
    for (const out of [...trailOuts(cutPoint, trail)].toSorted(compareArrows)) {
      seed.push({ arrow: out, direction: 'forward' });
    }
    for (const into of [...trailIns(cutPoint, trail)].toSorted(compareArrows)) {
      seed.push({ arrow: into, direction: 'backward' });
    }
    runFronts(state, victim, groups, trail, seed);
  };

  const withTrailUpdate = (
    state: GameState,
    victim: PlayerId,
    mutate: (groups: Map<ArrowId, Group>, trail: Set<ArrowId>) => void,
  ): GameState => {
    const current = state.trails.get(victim);
    if (current === undefined || current.size === 0) return state;
    const groups = new Map(state.groups);
    const working = new Set(current);
    mutate(groups, working);
    const trails = new Map(state.trails);
    if (working.size === 0) trails.delete(victim);
    else trails.set(victim, canonical([...working]));
    return { ...state, groups, trails };
  };

  const evaporateFrom = (
    state: GameState,
    victim: PlayerId,
    cutPoint: PointId,
  ): GameState =>
    withTrailUpdate(state, victim, (groups, trail) => {
      evaporateAtPoint(state, victim, cutPoint, groups, trail);
    });

  const evaporateFromArrow = (
    state: GameState,
    victim: PlayerId,
    emptied: ArrowId,
  ): GameState =>
    withTrailUpdate(state, victim, (groups, trail) => {
      if (!trail.has(emptied)) {
        scrubDormant(state, groups, trail, victim);
        return;
      }
      // Empty arrow cannot be a firebreak — destroy it and fan both ways.
      const seed: Front[] = [];
      for (const next of continuations(emptied, 'forward', trail)) {
        seed.push({ arrow: next, direction: 'forward' });
      }
      for (const next of continuations(emptied, 'backward', trail)) {
        seed.push({ arrow: next, direction: 'backward' });
      }
      trail.delete(emptied);
      runFronts(state, victim, groups, trail, seed);
    });

  const evaporate = (state: GameState, move: Move, mover: PlayerId): GameState => {
    if (move.kind !== 'step') return state;

    const victims = state.players.filter(
      (player) => player !== mover && trailCrosses(state, move, player),
    );
    if (victims.length === 0) return state;

    let next = state;
    for (const victim of victims) {
      next = evaporateFrom(next, victim, geometry.target(move.from));
    }
    return next;
  };

  const enemyMarks = (state: GameState, owner: PlayerId, arrow: ArrowId): boolean => {
    for (const [player, trail] of state.trails) {
      if (player === owner) continue;
      if (trail.has(arrow)) return true;
    }
    return false;
  };

  const territoryRootCuts = (
    state: GameState,
    mover: PlayerId,
    marked: ArrowId,
  ): GameState => {
    // Only a mark on someone else's territory can be a feeder paint-over.
    const owner = state.territory.get(marked);
    if (owner === undefined || owner === mover) return state;

    const p0 = geometry.target(marked);
    const feeders = geometry
      .inArrows(p0)
      .filter((a) => state.territory.get(a) === owner)
      .toSorted(compareArrows);
    if (feeders.length === 0) return state;
    if (!feeders.includes(marked)) return state;

    // Trail must originate from P0 (at least one trail out of P0).
    const ownerTrail = state.trails.get(owner);
    if (ownerTrail === undefined) return state;
    const outs = trailOuts(p0, ownerTrail);
    if (outs.length === 0) return state;

    const clean = feeders.filter((a) => !enemyMarks(state, owner, a));
    // This step just marked `marked`; if it was the last clean feeder, cut.
    if (clean.length > 0) return state;
    return evaporateFrom(state, owner, p0);
  };

  const scrubDormantTrails = (state: GameState): GameState => {
    let next = state;
    for (const player of state.players) {
      const current = next.trails.get(player);
      if (current === undefined || current.size === 0) continue;
      const groups = new Map(next.groups);
      const working = new Set(current);
      scrubDormant(next, groups, working, player);
      if (working.size === current.size) continue;
      const trails = new Map(next.trails);
      if (working.size === 0) trails.delete(player);
      else trails.set(player, canonical([...working]));
      next = { ...next, trails };
    }
    return next;
  };

  return {
    evaporate,
    evaporateFrom,
    evaporateFromArrow,
    scrubDormantTrails,
    territoryRootCuts,
  };
};
