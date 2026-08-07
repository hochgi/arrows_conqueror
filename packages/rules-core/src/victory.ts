/**
 * Victory — elimination and starvation (§9 / P09).
 *
 * Starvation advances on the same full-round boundary as accrual (P08 / item 41):
 * when the seat wraps to the first living player. A living player who owns **no**
 * spawner share for *N* consecutive full rounds loses; the other living seat wins.
 * (Former "domination" — own every share for *N* — was too slow once the board was
 * already decided.)
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

/** How many spawner-border arrows this player owns as territory. */
export const shareCountOf = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): number => {
  let n = 0;
  for (const vertex of [...state.spawners.keys()].toSorted(compareVertices)) {
    for (const arrow of [...geometry.borderArrows(vertex)].toSorted(compareArrows)) {
      if (state.territory.get(arrow) === player) n += 1;
    }
  }
  return n;
};

const clearStarvation = (state: GameState): GameState => {
  if (state.dominationStreak === 0 && state.dominationHolder === undefined) return state;
  return { ...state, dominationStreak: 0, dominationHolder: undefined };
};

/**
 * One full-round starvation tick. Call after accrual when the seat returns to
 * the first living player.
 *
 * Tracks the unique living player with **zero** shares. At *N* they lose and the
 * other living seat wins. Zero or several such players resets the clock — shared
 * destitution is not a win for anyone.
 *
 * Field names stay `domination*` (P09 / match logs); the meaning is starvation.
 */
export const tickDomination = (state: GameState, geometry: GeometryPort): GameState => {
  if (state.winner !== undefined) return state;

  const destitute = state.players.filter(
    (player) => headsOf(state, player) > 0 && shareCountOf(state, player, geometry) === 0,
  );

  if (destitute.length !== 1) return clearStarvation(state);

  const victim = destitute[0];
  if (victim === undefined) return clearStarvation(state);

  const streak =
    state.dominationHolder === victim ? state.dominationStreak + 1 : 1;
  const next: GameState = {
    ...state,
    dominationHolder: victim,
    dominationStreak: streak,
  };
  if (streak < state.dominationN) return next;

  const winner = state.players.find(
    (player) => player !== victim && headsOf(state, player) > 0,
  );
  if (winner === undefined) return next;
  return { ...next, winner };
};
