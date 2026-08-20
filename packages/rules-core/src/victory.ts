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

import type { GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
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
 *
 * SKELETON (P36 phase 2). It **throws** rather than returning a default: a
 * predicate that guessed `false` would turn every "is *not* lost" scenario green
 * before the rule existed, which is the one failure mode phase 2 is supposed to
 * make impossible.
 */
export const isLost = (
  _state: GameState,
  _player: PlayerId,
  _geometry: GeometryPort,
): boolean => {
  throw new Error('isLost is not implemented (P36 phase 2 skeleton)');
};

/**
 * One full-round starvation tick — **per seat**, in `state.players` order.
 *
 * A seat owning territory, no share and at least one head advances; every other
 * seat's streak clears. No seat's clock cancels another's.
 *
 * SKELETON (P36 phase 2): returns its input.
 */
export const tickStarvation = (state: GameState, _geometry: GeometryPort): GameState => state;

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
 *
 * SKELETON (P36 phase 2): returns its input.
 */
export const resolveLosses = (state: GameState, _geometry: GeometryPort): GameState => state;
