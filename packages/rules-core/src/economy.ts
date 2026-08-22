/**
 * Spawner accrual — exact rationals, full-round tick, blockade, reset-on-capture.
 *
 * SPEC §7, §11 items 13–15, 18, **41**, **47**. P08, P40.
 *
 * Accrual runs once per **full round**: when `endTurn` returns the active seat to
 * `players[0]`. Each spawner advances one round-robin step; enemy occupation
 * halts that share's *f*; friendly occupation accrues and merges with no §3
 * merge override (birth is not a spent move).
 *
 * P40: a birth onto another player's open trail is a cut at the birth arrow
 * (`evaporateFromArrow`). Bare marks do not halt; a garrison still does.
 *
 * @see docs/spec/economy/economy.md
 * @see docs/spec/birth-cut/birth-cut.md
 */

import {
  ZERO,
  add,
  fractionalPart,
  wholeSteps,
} from '@conquarrow/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Group,
  PlayerId,
  Rational,
  Spawner,
  VertexId,
} from '@conquarrow/contracts';
import { compareArrows, compareVertices } from './order';

const asGroup = (owner: PlayerId, heads: number, spent: number, override?: 0 | 1): Group =>
  override === undefined
    ? { owner, heads, spent }
    : { owner, heads, spent, speedOverride: override };

/** Border arrows of a vertex in the deterministic RR order. */
export const orderedBorders = (
  geometry: GeometryPort,
  vertex: VertexId,
): readonly ArrowId[] => [...geometry.borderArrows(vertex)].toSorted(compareArrows);

export type EvaporateFromArrow = (
  state: GameState,
  victim: PlayerId,
  emptied: ArrowId,
) => GameState;

const comparePlayers = (left: PlayerId, right: PlayerId): number => {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
};

/**
 * Reset accumulators on arrows whose territory owner just changed (capture, or
 * reversion to unowned when `nextOwner` is unset).
 */
export const resetAccumulatorsOnCapture = (
  state: GameState,
  taken: ReadonlySet<ArrowId>,
  previous: ReadonlyMap<ArrowId, PlayerId>,
  nextOwner: PlayerId | undefined,
): ReadonlyMap<ArrowId, Rational> => {
  let changed = false;
  const accumulators = new Map(state.accumulators);
  for (const arrow of [...taken].toSorted(compareArrows)) {
    if (previous.get(arrow) === nextOwner) continue;
    if (accumulators.has(arrow)) {
      accumulators.delete(arrow);
      changed = true;
    }
  }
  return changed ? accumulators : state.accumulators;
};

/**
 * Birth `count` heads for `owner` on `arrow` — merge without §3 override (§11 item 41).
 */
const birth = (
  groups: Map<ArrowId, Group>,
  arrow: ArrowId,
  owner: PlayerId,
  count: number,
): void => {
  if (count < 1) return;
  const standing = groups.get(arrow);
  if (standing === undefined) {
    groups.set(arrow, asGroup(owner, count, 0));
    return;
  }
  // Friendly merge: keep spent / override; enemy should have halted accrual.
  if (standing.owner !== owner) return;
  groups.set(
    arrow,
    asGroup(owner, standing.heads + count, standing.spent, standing.speedOverride),
  );
};

const storeAccumulator = (
  accumulators: Map<ArrowId, Rational>,
  arrow: ArrowId,
  value: Rational,
): void => {
  if (value.num === 0) accumulators.delete(arrow);
  else accumulators.set(arrow, value);
};

interface AccrualDraft {
  readonly groups: Map<ArrowId, Group>;
  readonly accumulators: Map<ArrowId, Rational>;
  readonly bornOn: ArrowId[];
}

const feedArrow = (
  state: GameState,
  draft: AccrualDraft,
  arrow: ArrowId,
  force: Rational,
): void => {
  const owner = state.territory.get(arrow);
  if (owner === undefined) return;
  const standing = draft.groups.get(arrow);
  if (standing !== undefined && standing.owner !== owner) return;
  const after = add(draft.accumulators.get(arrow) ?? ZERO, force);
  const born = wholeSteps(after);
  if (born > 0) {
    birth(draft.groups, arrow, owner, born);
    draft.bornOn.push(arrow);
    storeAccumulator(draft.accumulators, arrow, fractionalPart(after));
    return;
  }
  storeAccumulator(draft.accumulators, arrow, after);
};

/**
 * After births, cut every other player's trail that still contains a birth arrow.
 *
 * Births complete first. Then arrow-id order, then player-id order (P40).
 */
export const cutBirthsOnOpenTrail = (
  state: GameState,
  bornOn: readonly ArrowId[],
  evaporateFromArrow: EvaporateFromArrow,
): GameState => {
  if (bornOn.length === 0) return state;
  let next = state;
  for (const arrow of [...new Set(bornOn)].toSorted(compareArrows)) {
    const standing = next.groups.get(arrow);
    if (standing === undefined) continue;
    const victims = [...next.trails]
      .filter(([player, trail]) => player !== standing.owner && trail.has(arrow))
      .map(([player]) => player)
      .toSorted(comparePlayers);
    for (const victim of victims) {
      next = evaporateFromArrow(next, victim, arrow);
    }
  }
  return next;
};

/**
 * One full-round accrual tick: every spawner feeds one border arrow and advances phase.
 * Births onto foreign open trail then cut (P40).
 */
export const accrueRound = (
  state: GameState,
  geometry: GeometryPort,
  evaporateFromArrow: EvaporateFromArrow,
): GameState => {
  if (state.spawners.size === 0) return state;

  const groups = new Map(state.groups);
  const accumulators = new Map(state.accumulators);
  const spawners = new Map<VertexId, Spawner>();
  const draft: AccrualDraft = { groups, accumulators, bornOn: [] };
  let touched = false;

  for (const [vertex, spawner] of [...state.spawners].toSorted(([a], [b]) =>
    compareVertices(a, b),
  )) {
    const borders = orderedBorders(geometry, vertex);
    if (borders.length !== 3) {
      spawners.set(vertex, spawner);
      continue;
    }
    const phase = ((spawner.phase % 3) + 3) % 3;
    const arrow = borders[phase];
    if (arrow === undefined) {
      spawners.set(vertex, spawner);
      continue;
    }
    spawners.set(vertex, { force: spawner.force, phase: (phase + 1) % 3 });
    touched = true;
    feedArrow(state, draft, arrow, spawner.force);
  }

  if (!touched) return state;
  const accrued: GameState = { ...state, groups, accumulators, spawners };
  return cutBirthsOnOpenTrail(accrued, draft.bornOn, evaporateFromArrow);
};
