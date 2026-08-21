/**
 * Losing conditions — per seat, resolved on the move that causes them (§9 /
 * P36, retimed by P37).
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
 * **P37 retimed this.** {@link resolveLosses} runs on the tail of every applied
 * move rather than only inside the round boundary, so the match ends on the move
 * that decides it. The boundary's order is still **accrue, then
 * {@link tickStarvation}, then {@link resolveLosses}** — `apply` resolves after
 * `applyEndTurn` returns, and a streak counts *rounds*, so only the resolution
 * moved.
 *
 * Running per move makes the shape of this file a cost, and two things pay for
 * it:
 *
 * 1. **One census, not one scan per seat.** {@link censusOf} takes a single pass
 *    over `territory` and a single pass over `groups`; every seat's *T* and *H*
 *    are then reads off two small maps. The traversal count is independent of
 *    `state.players.length` — the naive per-seat shape cost +28 % on a fold of
 *    the 1247-move playtest log.
 * 2. **The share walk is short-circuited away.** `isLost` is
 *    `T === 0 || (S === 0 && H === 0)` *in that order*: `T === 0` decides alone,
 *    and otherwise `H > 0` has already falsified the second disjunct. So the
 *    `spawners × borderArrows` walk is reached only for a seat that owns ground
 *    and holds no head, and on a board where every living seat holds a head
 *    `apply` reads no vertex at all. That is required rather than tasteful:
 *    `closure`, `cuts`, `encirclement`, `fill` and `refuse-self-convert` each
 *    state *the system shall enumerate no vertex*, and an unconditional walk
 *    would falsify them on every move.
 *
 * @see docs/spec/immediate-loss/immediate-loss.md
 * @see docs/spec/losing-conditions/losing-conditions.md
 */

import type { ArrowId, GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
import { resetAccumulatorsOnCapture } from './economy';
import { compareArrows } from './order';

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

/**
 * How many **distinct** spawner-border arrows this player holds as territory —
 * the *S* reading of the decided table.
 *
 * Deduplicated by arrow: an arrow flanking two spawner vertices is one piece of
 * territory and counts once. Every rule here reads only whether this is zero, but
 * a count that could exceed the arrows it counted is a wrong answer waiting for
 * its first reader, and this is exported.
 *
 * No ordering: a set's size does not depend on the order it was filled, so the
 * spawner and border walks are taken as the port hands them over. Sorting them
 * would only read as if the order decided something.
 */
export const shareCountOf = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): number => {
  const owned = new Set<ArrowId>();
  for (const vertex of state.spawners.keys()) {
    for (const arrow of geometry.borderArrows(vertex)) {
      if (state.territory.get(arrow) === player) owned.add(arrow);
    }
  }
  return owned.size;
};

/**
 * Who owns ground and who holds a head, from one pass over `territory` and one
 * over `groups`.
 *
 * The whole reason the per-move retiming is affordable: the traversal count is
 * two whatever `state.players.length` is, where a scan per seat would be two per
 * seat. Seats absent from a set simply read false, so the census needs no seat
 * list and cannot cost anything per seat.
 *
 * **Membership, not counts**, because the §9 table branches on *T > 0* and
 * *H > 0* and never on how much. `groups` membership already *is* "holds a head":
 * a group carries at least one head and an arrow holding none is absent from the
 * map rather than present with a zero (`contracts/game-state.ts`). A census
 * carrying totals nobody reads would be a wrong answer waiting for its first
 * reader; {@link headsOf} and {@link territoryCountOf} are there for a caller who
 * wants the number.
 *
 * *S* is deliberately **not** here: a share reading needs the
 * `spawners × borderArrows` walk, which is neither of these maps, and which
 * {@link isLostFrom} is built to never reach.
 */
interface Census {
  /** Seats holding at least one arrow of closed ground — *T > 0*. */
  readonly ownsGround: ReadonlySet<PlayerId>;
  /** Seats with at least one head standing — *H > 0*. */
  readonly holdsHead: ReadonlySet<PlayerId>;
}

const censusOf = (state: GameState): Census => {
  const ownsGround = new Set<PlayerId>();
  const holdsHead = new Set<PlayerId>();
  for (const owner of state.territory.values()) ownsGround.add(owner);
  for (const group of state.groups.values()) holdsHead.add(group.owner);
  return { ownsGround, holdsHead };
};

/**
 * The decided losing predicate, spelled **once**: `T === 0 || (S === 0 && H === 0)`.
 *
 * The readings arrive as thunks because here the *order of evaluation is part of
 * the rule*, not an optimisation laid on top of it. No ground decides alone;
 * otherwise a head has already falsified the second disjunct. So `ownsShare` —
 * the one reading that walks the spawner lattice — is called only for a seat that
 * owns ground and holds no head (invariant 16).
 *
 * Heads before shares, rather than the table's `S === 0 && H === 0` ordering: a
 * conjunction is symmetric, and this is the order that keeps the lattice out of
 * it.
 *
 * One spelling and two callers on purpose — {@link isLost} is what adapters and
 * tests read, {@link isLostFrom} is what the resolution pass reads, and a rule
 * written down twice is a rule that can drift.
 */
const lostFrom = (
  ownsGround: boolean,
  holdsHead: () => boolean,
  ownsShare: () => boolean,
): boolean => !ownsGround || (!holdsHead() && !ownsShare());

/** {@link lostFrom} over a {@link Census} — the resolution pass's reading. */
const isLostFrom = (
  state: GameState,
  census: Census,
  player: PlayerId,
  geometry: GeometryPort,
): boolean =>
  lostFrom(
    census.ownsGround.has(player),
    () => census.holdsHead.has(player),
    () => shareCountOf(state, player, geometry) > 0,
  );

/**
 * The derived losing predicate — the two *immediate* rows of the table.
 *
 * `territoryCount === 0 || (shares === 0 && heads === 0)`. Idempotent once the
 * seat's pieces are gone, which is why no flag joins `GameState`.
 *
 * Counts each reading for itself rather than building a census, because a caller
 * asking about one seat should not pay for the whole table. Same predicate, same
 * short circuit — {@link lostFrom} owns both.
 */
export const isLost = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): boolean =>
  lostFrom(
    territoryCountOf(state, player) > 0,
    () => headsOf(state, player) > 0,
    () => shareCountOf(state, player, geometry) > 0,
  );

/**
 * Territory, no share, at least one head — the starvation-clock row.
 *
 * Not the negation of {@link lostFrom}: this is a third row of the table, and it
 * is the one row where *S* is unavoidable — the clock row and normal play differ
 * in nothing else, so every seat holding ground and a head needs the walk. That
 * is affordable because the tick runs only at a full-round boundary, where
 * accrual reads the lattice by design (§7).
 */
const onTheClock = (
  state: GameState,
  census: Census,
  player: PlayerId,
  geometry: GeometryPort,
): boolean =>
  census.ownsGround.has(player) &&
  census.holdsHead.has(player) &&
  shareCountOf(state, player, geometry) === 0;

/**
 * One full-round starvation tick — **per seat**, in `state.players` order.
 *
 * A seat owning territory, no share and at least one head advances; every other
 * seat's streak clears. No seat's clock cancels another's.
 */
export const tickStarvation = (state: GameState, geometry: GeometryPort): GameState => {
  const census = censusOf(state);
  const next = new Map<PlayerId, number>();
  for (const player of state.players) {
    if (!onTheClock(state, census, player, geometry)) continue;
    next.set(player, (state.starvationStreaks.get(player) ?? 0) + 1);
  }
  return { ...state, starvationStreaks: next };
};

const qualifiesToVanish = (
  state: GameState,
  census: Census,
  player: PlayerId,
  geometry: GeometryPort,
): boolean =>
  isLostFrom(state, census, player, geometry) ||
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

/**
 * The seat left holding the match, or nothing.
 *
 * Takes the survivors it is *given* rather than re-deriving them, which is the
 * other half of the one-census budget: the old shape re-ran `isLost` for every
 * seat inside the win check, doubling the per-seat cost the census was there to
 * remove.
 *
 * Handing survivors in is sound because **removal gives nobody anything**: a
 * vanishing seat's territory becomes unowned rather than someone else's, so no
 * removal can change another seat's *T*, *S* or *H*. A seat that did not qualify
 * before the pass is therefore not lost after it, and a seat that did is lost
 * after it — its land is gone. So *survivors* and *seats not lost in the
 * resolved state* are the same set.
 */
const withWinner = (state: GameState, survivors: readonly PlayerId[]): GameState => {
  const winner = survivors.length === 1 ? survivors[0] : undefined;
  if (winner === state.winner) return state;
  return { ...state, winner };
};

/**
 * Resolve every loss the state now qualifies, in `state.players` order.
 *
 * Runs on the tail of every applied move (P37), not only at the round boundary.
 * A seat qualifies when {@link isLost} holds, or when its starvation streak has
 * reached `dominationN`. Every qualifying seat's heads, trail marks and
 * territory are removed; vacated territory is left unowned with its
 * accumulators reset (§7). `state.players` is untouched. `winner` is set only
 * when exactly one seat is not lost **after** every removal — two or more
 * remaining leaves it unset, and zero remaining is unreachable by play (§11
 * item 44, resolved by dissolution: no path un-owns a spawner share, so some
 * seat always holds one and is never lost).
 *
 * Qualification is decided against `state` as it stood at the start of the pass
 * and removals accumulate onto `next`. Sound at any frequency, for the reason
 * {@link withWinner} spells out.
 */
export const resolveLosses = (state: GameState, geometry: GeometryPort): GameState => {
  const census = censusOf(state);
  const survivors: PlayerId[] = [];
  let next = state;
  for (const player of state.players) {
    if (qualifiesToVanish(state, census, player, geometry)) next = vanishSeat(next, player);
    else survivors.push(player);
  }
  return withWinner(next, survivors);
};
