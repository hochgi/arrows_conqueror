/**
 * Encirclement / conversion — enemy heads inside your territory without a
 * territory-grade trail flip owner (§6.3, §11 items 9, 28, **40**).
 *
 * Pure: scan occupancy after combat → cut → closure. No trail stripping here —
 * a territory-grade trail already blocks conversion; cuts own evaporation.
 *
 * @see docs/spec/encirclement/encirclement.md
 */

import type { AnchorGrade, ArrowId, GameState, Group, PlayerId } from '@arrows/contracts';
import { compareArrows } from './order';

/**
 * Whether `player`'s trail covering `arrow` is territory grade.
 *
 * An arrow not in their trail has no grade and does not protect.
 */
const hasTerritoryGrade = (
  state: GameState,
  arrow: ArrowId,
  player: PlayerId,
  gradeOf: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade,
): boolean => {
  const trail = state.trails.get(player);
  if (trail === undefined || !trail.has(arrow)) return false;
  return gradeOf(state, arrow, player) === 'territory';
};

/**
 * Flip every encircled group to the territory owner. Head count intact; spent 0;
 * merge override dropped (§11 item 40). Arrow-id order for determinism.
 *
 * Returns the input state reference when nothing converts.
 */
export const convertEncircled = (
  state: GameState,
  gradeOf: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade,
): GameState => {
  let changed = false;
  const groups = new Map<ArrowId, Group>(state.groups);

  for (const [arrow, group] of [...state.groups].toSorted(([a], [b]) => compareArrows(a, b))) {
    const landOwner = state.territory.get(arrow);
    if (landOwner === undefined || landOwner === group.owner) continue;
    if (hasTerritoryGrade(state, arrow, group.owner, gradeOf)) continue;

    groups.set(arrow, { owner: landOwner, heads: group.heads, spent: 0 });
    changed = true;
  }

  return changed ? { ...state, groups } : state;
};
