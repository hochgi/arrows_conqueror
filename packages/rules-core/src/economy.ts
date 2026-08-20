/**
 * Spawner accrual — exact rationals, full-round tick, blockade, reset-on-capture.
 *
 * SPEC §7, §11 items 13–15, 18, **41**. P08.
 *
 * Accrual runs once per **full round**: when `endTurn` returns the active seat to
 * `players[0]`. Each spawner advances one round-robin step; enemy occupation
 * halts that share's *f*; friendly occupation accrues and merges with no §3
 * merge override (birth is not a spent move).
 *
 * @see docs/spec/economy/economy.md
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

/**
 * One full-round accrual tick: every spawner feeds one border arrow and advances phase.
 */
export const accrueRound = (state: GameState, geometry: GeometryPort): GameState => {
  if (state.spawners.size === 0) return state;

  const groups = new Map(state.groups);
  const accumulators = new Map(state.accumulators);
  const spawners = new Map<VertexId, Spawner>();
  let touched = false;

  for (const [vertex, spawner] of [...state.spawners].toSorted(([a], [b]) =>
    compareVertices(a, b),
  )) {
    const borders = orderedBorders(geometry, vertex);
    if (borders.length !== 3) {
      // Conformant boards always have 3; refuse quietly by skipping rather than
      // inventing a feed target.
      spawners.set(vertex, spawner);
      continue;
    }
    const phase = ((spawner.phase % 3) + 3) % 3;
    const arrow = borders[phase];
    if (arrow === undefined) {
      spawners.set(vertex, spawner);
      continue;
    }
    const nextPhase = (phase + 1) % 3;
    spawners.set(vertex, { force: spawner.force, phase: nextPhase });
    touched = true;

    const owner = state.territory.get(arrow);
    if (owner === undefined) continue;

    const standing = groups.get(arrow);
    if (standing !== undefined && standing.owner !== owner) {
      // Enemy blockade: RR advanced, *f* lost, accumulator held.
      continue;
    }

    const before = accumulators.get(arrow) ?? ZERO;
    const after = add(before, spawner.force);
    const born = wholeSteps(after);
    if (born > 0) {
      birth(groups, arrow, owner, born);
      const rem = fractionalPart(after);
      if (rem.num === 0) accumulators.delete(arrow);
      else accumulators.set(arrow, rem);
    } else if (after.num === 0) {
      accumulators.delete(arrow);
    } else {
      accumulators.set(arrow, after);
    }
  }

  if (!touched) return state;
  return { ...state, groups, accumulators, spawners };
};
