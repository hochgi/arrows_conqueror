/**
 * Victory — elimination and domination (§9 / P09).
 *
 * Domination advances on the same full-round boundary as accrual (P08 / item 41):
 * when `endTurn` returns the seat to `players[0]`. Holding means owning every
 * spawner share as territory — blockade does not count.
 */

import type { GameState, GeometryPort, PlayerId } from '@arrows/contracts';
import { compareArrows, compareVertices } from './order';

const headsOf = (state: GameState, player: PlayerId): number => {
  let total = 0;
  for (const group of state.groups.values()) {
    if (group.owner === player) total += group.heads;
  }
  return total;
};

/** Elimination: a player with zero heads loses; the other wins. */
export const applyElimination = (state: GameState): GameState => {
  if (state.winner !== undefined) return state;
  const [first, second] = state.players;
  const h1 = headsOf(state, first);
  const h2 = headsOf(state, second);
  if (h1 === 0 && h2 === 0) return state; // both empty — leave undecided (degenerate)
  if (h1 === 0) return { ...state, winner: second };
  if (h2 === 0) return { ...state, winner: first };
  return state;
};

const ownsAllShares = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): boolean => {
  if (state.spawners.size === 0) return false;
  for (const vertex of [...state.spawners.keys()].toSorted(compareVertices)) {
    for (const arrow of [...geometry.borderArrows(vertex)].toSorted(compareArrows)) {
      if (state.territory.get(arrow) !== player) return false;
    }
  }
  return true;
};

/**
 * One full-round domination tick. Call after accrual when the seat returns to
 * `players[0]`.
 */
export const tickDomination = (state: GameState, geometry: GeometryPort): GameState => {
  if (state.winner !== undefined) return state;

  const [first, second] = state.players;
  const holder: PlayerId | undefined = ownsAllShares(state, first, geometry)
    ? first
    : ownsAllShares(state, second, geometry)
      ? second
      : undefined;

  if (holder === undefined) {
    if (state.dominationStreak === 0 && state.dominationHolder === undefined) return state;
    return { ...state, dominationStreak: 0, dominationHolder: undefined };
  }

  const streak =
    state.dominationHolder === holder ? state.dominationStreak + 1 : 1;
  const next: GameState = {
    ...state,
    dominationHolder: holder,
    dominationStreak: streak,
  };
  if (streak >= state.dominationN) return { ...next, winner: holder };
  return next;
};
