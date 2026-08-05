/**
 * The board state the movement rules read.
 *
 * SPEC §3 (heads, stacks, allowance and spending), §4 (turn structure). P04
 * decisions D1, D3 and D4.
 *
 * Data and nothing else — no method, no derivation, no board. Geometry stays on
 * `GeometryPort` and every rule stays on `RulesPort`, so a state can be
 * hand-authored by a test (P04 D8) without dragging an engine in with it.
 *
 * P01 deliberately deferred this: a state shape guessed before a rule needed it
 * would have invented trails, territory and closure in type form. What is here
 * is exactly what movement reads. Later packets grow it — a trail set (P05), an
 * accumulator per arrow (P08) — and the absence of those fields is a statement
 * about scope, not an oversight.
 *
 * @see docs/spec/movement/movement.md
 */

import type { ArrowId, PlayerId } from './ids';

/**
 * The §3 price of merging mid-turn, as a speed override for the rest of the turn.
 *
 * `1` for a stack that merged; `0` once **any** group that arrived outnumbered
 * what it joined. Absent means no merge touched the group this turn and its
 * allowance is plain `speed(heads)`.
 *
 * Two values, because §3 prices exactly two cases. A third would be a merge cost
 * the spec does not state. Expressed as an override rather than a special case so
 * that allowance arithmetic stays `spent < effectiveSpeed` everywhere (P04 D4).
 */
export type MergeOverride = 0 | 1;

/**
 * A **group**: the heads of one player standing on one arrow (§3).
 *
 * Allowance belongs to the group — not to a head, not to a player — which is why
 * `spent` lives here and not beside `activePlayer`. There is no group identity:
 * a group is *whatever* stands on an arrow right now, so splitting and merging
 * need no births and deaths, only counts (§4, SPEC §11 item 21).
 */
export interface Group {
  readonly owner: PlayerId;
  /**
   * Stack size **is** lives (§3). At least 1 — an arrow holding zero heads is
   * absent from {@link GameState.groups}, not present with a zero.
   */
  readonly heads: number;
  /**
   * Whole steps this group has already taken this turn. Nothing banks: end-turn
   * zeroes it (§3, SPEC §11 item 20).
   */
  readonly spent: number;
  /**
   * Set only by a merge, and only for the rest of the turn (§3). Absent is the
   * ordinary case and means `speed(heads)`.
   */
  readonly speedOverride?: MergeOverride;
}

/**
 * A whole position: who is to move, and what stands where.
 *
 * Immutable, and `apply` returns a new one (ADR 0001, P01 D5). There is no move
 * log here — a turn is an ordered list of `Move`s held by whatever is replaying
 * it (P10), not state the rules read.
 */
export interface GameState {
  /**
   * The two players, in turn order. MVP is 2, hot-seat (§4); 3+ is deferred with
   * its own design pass (SPEC §11 item 11), so the pair is written into the type
   * rather than a length being assumed of a list.
   */
  readonly players: readonly [PlayerId, PlayerId];
  /** Whose turn it is. Only this player's groups may step or skip (§4). */
  readonly activePlayer: PlayerId;
  /**
   * Occupancy: at most one owner per arrow (P04 D1). An arrow absent from the map
   * is **empty**; an arrow held by the other player is **enemy-occupied**. There
   * is no contested-occupancy shape in P04 — that arrives with combat (P06).
   */
  readonly groups: ReadonlyMap<ArrowId, Group>;
}
