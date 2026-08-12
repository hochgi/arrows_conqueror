/**
 * Encirclement / conversion — enemy heads inside your territory without a
 * territory-grade trail flip owner (§6.3, §11 items 9, 28, **40** / P22).
 *
 * P22: conversion strips the victim's trail from converted arrows only — orphan
 * dormant remnant stays marked (no scrub, no evaporation fronts).
 *
 * @see docs/spec/encirclement/encirclement.md
 */

import type { AnchorGrade, ArrowId, GameState, Group, PlayerId } from '@arrows/contracts';
import { compareArrows } from './order';

/** Rebuild a trail set sorted, so iteration order never rests on insertion luck. */
const canonical = (arrows: readonly ArrowId[]): ReadonlySet<ArrowId> =>
  new Set([...new Set(arrows)].toSorted(compareArrows));

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

/** Drop `arrow` from `victim`'s trail; leave every other mark standing. */
const stripTrailArrow = (state: GameState, victim: PlayerId, arrow: ArrowId): GameState => {
  const current = state.trails.get(victim);
  if (current === undefined || !current.has(arrow)) return state;
  const kept = [...current].filter((a) => a !== arrow);
  const trails = new Map(state.trails);
  if (kept.length === 0) trails.delete(victim);
  else trails.set(victim, canonical(kept));
  return { ...state, trails };
};

/**
 * Flip every encircled group to the territory owner. Head count intact; spent 0;
 * merge override dropped; victim trail stripped from converted arrows only (P22).
 */
export const convertEncircled = (
  state: GameState,
  gradeOf: (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade,
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
    next = stripTrailArrow(next, victim, arrow);
  }
  return next;
};
