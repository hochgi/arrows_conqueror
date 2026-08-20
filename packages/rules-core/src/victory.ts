/**
 * Losing conditions — per seat, resolved at the round boundary (§9 / P36).
 *
 * §9's headline rule ("lose your last head and you are out") is **repealed**.
 * Losing is the four-case table over territory *T*, spawner shares *S* and heads
 * *H*; a share *is* territory on a spawner-border arrow, so `S > 0 ⟹ T > 0` and
 * the cases are exhaustive and disjoint:
 *
 * | *T* | *S* | *H* | Outcome |
 * |---|---|---|---|
 * | 0 | — | — | lost — can never claim again (§8) |
 * | >0 | 0 | >0 | starvation clock — *N* full rounds, then lost |
 * | >0 | 0 | 0 | lost — no production and no units |
 * | >0 | >0 | 0 | alive, passed over until a spawner yields a head |
 * | >0 | >0 | >0 | normal play |
 *
 * `lost` is **derived, not stored** ({@link isLost}); what is stored is the
 * per-seat starvation streak, because a streak is history.
 *
 * A lost seat **vanishes**: heads, trail marks and territory removed, vacated
 * territory left unowned with its accumulators reset (§7). The match ends when
 * one seat remains. `state.players` is never mutated or reordered — a seat with
 * no legal move is passed, never skipped.
 *
 * Order inside the boundary is fixed and load-bearing: **accrue, then
 * {@link tickStarvation}, then {@link resolveLosses}**.
 *
 * @see docs/spec/losing-conditions/losing-conditions.md
 */

import type { ArrowId, GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
import { resetAccumulatorsOnCapture } from './economy';
import { compareArrows, compareVertices } from './order';

export const headsOf = (state: GameState, player: PlayerId): number => {
  let total = 0;
  for (const group of state.groups.values()) {
    if (group.owner === player) total += group.heads;
  }
  return total;
};

/** How many arrows this player holds as closed ground (§7). */
export const territoryCountOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const owner of state.territory.values()) {
    if (owner === player) n += 1;
  }
  return n;
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

/**
 * The derived losing predicate — the two *immediate* rows of the table.
 *
 * `territoryCount === 0 || (shares === 0 && heads === 0)`. Idempotent once the
 * seat's pieces are gone, which is why no flag joins `GameState`.
 */
export const isLost = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): boolean => {
  if (territoryCountOf(state, player) === 0) return true;
  return shareCountOf(state, player, geometry) === 0 && headsOf(state, player) === 0;
};

/** Territory, no share, at least one head — the starvation-clock row. */
const onTheClock = (state: GameState, player: PlayerId, geometry: GeometryPort): boolean =>
  territoryCountOf(state, player) > 0 &&
  shareCountOf(state, player, geometry) === 0 &&
  headsOf(state, player) > 0;

/**
 * One full-round starvation tick — **per seat**, in `state.players` order.
 *
 * A seat owning territory, no share and at least one head advances; every other
 * seat's streak clears. No seat's clock cancels another's.
 */
export const tickStarvation = (state: GameState, geometry: GeometryPort): GameState => {
  const next = new Map<PlayerId, number>();
  for (const player of state.players) {
    if (!onTheClock(state, player, geometry)) continue;
    next.set(player, (state.starvationStreaks.get(player) ?? 0) + 1);
  }
  return { ...state, starvationStreaks: next };
};

const qualifiesToVanish = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): boolean =>
  isLost(state, player, geometry) ||
  (state.starvationStreaks.get(player) ?? 0) >= state.dominationN;

const arrowsOwnedBy = (
  territory: ReadonlyMap<ArrowId, PlayerId>,
  player: PlayerId,
): ReadonlySet<ArrowId> => {
  const vacated = new Set<ArrowId>();
  for (const [arrow, owner] of territory) {
    if (owner === player) vacated.add(arrow);
  }
  return vacated;
};

const dropGroupsOf = (groups: GameState['groups'], player: PlayerId): GameState['groups'] =>
  new Map([...groups].filter(([, group]) => group.owner !== player));

const dropTrailOf = (trails: GameState['trails'], player: PlayerId): GameState['trails'] => {
  if (!trails.has(player)) return trails;
  const next = new Map(trails);
  next.delete(player);
  return next;
};

const dropArrows = (
  territory: ReadonlyMap<ArrowId, PlayerId>,
  vacated: ReadonlySet<ArrowId>,
): ReadonlyMap<ArrowId, PlayerId> => {
  if (vacated.size === 0) return territory;
  const next = new Map(territory);
  for (const arrow of [...vacated].toSorted(compareArrows)) next.delete(arrow);
  return next;
};

const dropStreakOf = (
  streaks: ReadonlyMap<PlayerId, number>,
  player: PlayerId,
): ReadonlyMap<PlayerId, number> => {
  if (!streaks.has(player)) return streaks;
  const next = new Map(streaks);
  next.delete(player);
  return next;
};

/** Clear the seat's pieces; leave vacated arrows unowned; do not rewrite `players`. */
const vanishSeat = (state: GameState, player: PlayerId): GameState => {
  const vacated = arrowsOwnedBy(state.territory, player);
  return {
    ...state,
    groups: dropGroupsOf(state.groups, player),
    trails: dropTrailOf(state.trails, player),
    territory: dropArrows(state.territory, vacated),
    accumulators: resetAccumulatorsOnCapture(state, vacated, state.territory, undefined),
    starvationStreaks: dropStreakOf(state.starvationStreaks, player),
  };
};

const withWinner = (state: GameState, geometry: GeometryPort): GameState => {
  const remaining = state.players.filter((player) => !isLost(state, player, geometry));
  const winner = remaining.length === 1 ? remaining[0] : undefined;
  if (winner === state.winner) return state;
  return { ...state, winner };
};

/**
 * Resolve the boundary's losses, in `state.players` order.
 *
 * A seat qualifies when {@link isLost} holds, or when its starvation streak has
 * reached `dominationN`. Every qualifying seat's heads, trail marks and
 * territory are removed; vacated territory is left unowned with its
 * accumulators reset (§7). `state.players` is untouched. `winner` is set only
 * when exactly one seat is not lost **after** every removal — two or more
 * remaining leaves it unset, and zero remaining also leaves it unset
 * (SPEC §11 item 44, recorded as wrong).
 */
export const resolveLosses = (state: GameState, geometry: GeometryPort): GameState => {
  let next = state;
  for (const player of state.players) {
    if (!qualifiesToVanish(state, player, geometry)) continue;
    next = vanishSeat(next, player);
  }
  return withWinner(next, geometry);
};
