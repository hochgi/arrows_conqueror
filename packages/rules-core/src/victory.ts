/**
 * Victory — elimination and domination (§9 / P09).
 *
 * Domination advances on the same full-round boundary as accrual (P08 / item 41):
 * when the seat wraps to the first living player. Holding means owning every
 * spawner share as territory — blockade does not count.
 */

import type { GameState, GeometryPort, PlayerId } from '@arrows/contracts';
import { compareArrows, compareVertices } from './order';

export const headsOf = (state: GameState, player: PlayerId): number => {
  let total = 0;
  for (const group of state.groups.values()) {
    if (group.owner === player) total += group.heads;
  }
  return total;
};

/** First living seat in turn order — the full-round boundary marker. */
export const firstAlive = (state: GameState): PlayerId | undefined => {
  for (const player of state.players) {
    if (headsOf(state, player) > 0) return player;
  }
  return undefined;
};

/** Elimination: last player with any heads wins. */
export const applyElimination = (state: GameState): GameState => {
  if (state.winner !== undefined) return state;
  const alive = state.players.filter((player) => headsOf(state, player) > 0);
  if (alive.length === 1) {
    const winner = alive[0];
    if (winner === undefined) return state;
    return { ...state, winner };
  }
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
 * the first living player.
 */
export const tickDomination = (state: GameState, geometry: GeometryPort): GameState => {
  if (state.winner !== undefined) return state;

  let holder: PlayerId | undefined;
  for (const player of state.players) {
    if (ownsAllShares(state, player, geometry)) {
      holder = player;
      break;
    }
  }

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
