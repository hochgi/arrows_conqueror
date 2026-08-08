/**
 * Encirclement / conversion — enemy heads inside your territory without a
 * territory-grade trail flip owner (§6.3, §11 items 9, 28, **40** / P12).
 *
 * P12: conversion strips the victim's trail from converted arrows via
 * `evaporateFromArrow` (orphan dormant remnants scrubbed inside cuts).
 *
 * @see docs/spec/encirclement/encirclement.md
 */

import type { AnchorGrade, ArrowId, GameState, Group, PlayerId } from '@arrows/contracts';
import type { CutRules } from './cuts';
import { compareArrows } from './order';

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
 * merge override dropped; victim trail stripped from converted arrows (P12).
 */
export const convertEncircled = (
  state: GameState,
  gradeOf: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade,
  cuts: CutRules,
): GameState => {
  const converted: { readonly victim: PlayerId; readonly arrow: ArrowId }[] = [];
  const groups = new Map<ArrowId, Group>(state.groups);

  for (const [arrow, group] of [...state.groups].toSorted(([a], [b]) => compareArrows(a, b))) {
    const landOwner = state.territory.get(arrow);
    if (landOwner === undefined || landOwner === group.owner) continue;
    if (hasTerritoryGrade(state, arrow, group.owner, gradeOf)) continue;

    converted.push({ victim: group.owner, arrow });
    groups.set(arrow, { owner: landOwner, heads: group.heads, spent: 0 });
  }

  if (converted.length === 0) return state;

  let next: GameState = { ...state, groups };
  for (const { victim, arrow } of converted) {
    next = cuts.evaporateFromArrow(next, victim, arrow);
  }
  return next;
};
