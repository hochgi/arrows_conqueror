/**
 * The movement engine — allowance, splitting, merging, skip and the turn loop.
 *
 * SPEC §3 (speed, merge cost, spending), §4 (turn structure), §2 (movement
 * follows the grain), §11 items 19–22 and 33. P04 decisions D1–D9.
 *
 * Pure: every function here is a function of `(state, move)` and the board it was
 * built over. No clock, no randomness, no I/O, and no mutation of an input state
 * (AGENTS.md, ADR 0001) — a copy of the occupancy map is made before anything is
 * written to it, and a move that changes nothing returns the state it was given.
 *
 * The board arrives as a `GeometryPort` and nothing else, so the grain is asked
 * for rather than assumed and a fixture board (P02) and the generated tiling
 * (P03) satisfy these rules unchanged.
 *
 * @see docs/spec/movement/movement.md
 */

import { ContractViolation, endTurn, isSatisfiableBy, skip, speed, step } from '@arrows/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Group,
  MergeOverride,
  Move,
  PlayerId,
  RulesPort,
  SkipMove,
  StepMove,
} from '@arrows/contracts';
import { makeTrailRules } from './trails';

/**
 * Refuse a move. An illegal move is never a plausible no-op (P04 D2, D9): a
 * wrong step must not become a silent wrong board state.
 *
 * Local rather than imported: `reject` is internal to `@arrows/contracts`, and
 * the error type is the part of it that is public.
 */
const reject = (message: string): never => {
  throw new ContractViolation(message);
};

/**
 * A group, with `speedOverride` present only when there is one to carry.
 *
 * `exactOptionalPropertyTypes` makes the distinction real: absent means plain
 * `speed(heads)`, and an explicit `undefined` is not the same thing.
 */
const asGroup = (
  owner: PlayerId,
  heads: number,
  spent: number,
  override?: MergeOverride,
): Group =>
  override === undefined
    ? { owner, heads, spent }
    : { owner, heads, spent, speedOverride: override };

/** A total order on arrows, so an ordered answer never rests on map order. */
const compareArrows = (left: ArrowId, right: ArrowId): number => {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
};

/**
 * Build the movement rules over a board.
 *
 * The board arrives as a port and nothing else — the engine never learns which
 * implementation it got, so a hand-authored fixture (P02) and the generated
 * tiling (P03) satisfy the same rules unchanged.
 */
export const makeRules = (geometry: GeometryPort): RulesPort => {
  /**
   * How far the group may go this turn: `speed(heads)`, unless a merge set an
   * override for the rest of the turn (§3, D4). Stated as an override so every
   * allowance question stays `spent < allowance`.
   */
  const allowanceOf = (group: Group): number => group.speedOverride ?? speed(group.heads);

  /**
   * The group standing on `arrow`, or a refusal.
   *
   * `target` is asked first and its answer thrown away: it is the board's own
   * check that this arrow exists, so a foreign id fails loudly rather than
   * reading as an empty arrow (P04 D9).
   */
  const groupOn = (state: GameState, arrow: ArrowId): Group => {
    geometry.target(arrow);
    return state.groups.get(arrow) ?? reject(`no group stands on ${String(arrow)}`);
  };

  const requireActive = (state: GameState, arrow: ArrowId): Group => {
    const group = groupOn(state, arrow);
    if (group.owner !== state.activePlayer) {
      reject(`${String(arrow)} is held by ${String(group.owner)}, not the active player`);
    }
    return group;
  };

  /** Movement follows the grain (§2): the only exits are the target's out-arrows. */
  const exitsFrom = (arrow: ArrowId): readonly ArrowId[] =>
    geometry.outArrows(geometry.target(arrow));

  /**
   * May the active player's heads land here? Empty ground or their own group —
   * an opponent-held arrow is refused, because contact is combat (P06, §6.2) and
   * not a movement rule.
   */
  const canLand = (state: GameState, exit: ArrowId): boolean => {
    const standing = state.groups.get(exit);
    return standing === undefined || standing.owner === state.activePlayer;
  };

  /**
   * What stands on the destination once the step has landed.
   *
   * Empty ground: the movers carry their own `spent`, one more for this step, and
   * they carry any merge override **with them** — an override travels with the
   * heads, not with the arrow it was set on (SPEC §11 item 33, resolved).
   *
   * A merge: the arrivals' spending is discarded and the destination's is kept,
   * and the override is computed fresh here from arrival against joined. *Any*
   * majority arrival bars the merged group for the rest of the turn, so a
   * barred destination stays barred however small the next arrival is (§3).
   */
  const landing = (movers: Group, count: number, joined: Group | undefined): Group => {
    if (joined === undefined) {
      return asGroup(movers.owner, count, movers.spent + 1, movers.speedOverride);
    }
    const barred = joined.speedOverride === 0 || count > joined.heads;
    return asGroup(joined.owner, joined.heads + count, joined.spent, barred ? 0 : 1);
  };

  /**
   * The group a step moves, or a refusal — every reason P04 D2 gives, in one
   * place, so no caller can take a step past a check by accident.
   */
  const moversFor = (state: GameState, move: StepMove): Group => {
    const movers = requireActive(state, move.from);
    const allowance = allowanceOf(movers);
    if (!exitsFrom(move.from).includes(move.exit)) {
      reject(
        `${String(move.exit)} is not an out-arrow of the target of ${String(move.from)} — movement follows the grain`,
      );
    }
    if (!isSatisfiableBy(move, movers.heads)) {
      reject(
        `${String(move.from)} holds ${String(movers.heads)} heads, so ${String(move.count)} cannot step`,
      );
    }
    if (movers.spent >= allowance) {
      reject(
        `the group on ${String(move.from)} has spent ${String(movers.spent)} of its ${String(allowance)}`,
      );
    }
    if (!canLand(state, move.exit)) {
      reject(`${String(move.exit)} is held by the opponent — contact is P06, not movement`);
    }
    return movers;
  };

  const applyStep = (state: GameState, move: StepMove): GameState => {
    const movers = moversFor(state, move);
    const groups = new Map(state.groups);
    const remainder = movers.heads - move.count;
    // A split leaves the remainder its parent's `spent` and its parent's override,
    // and only the movers pay for the step (§3; SPEC §11 item 33).
    if (remainder === 0) {
      groups.delete(move.from);
    } else {
      groups.set(
        move.from,
        asGroup(movers.owner, remainder, movers.spent, movers.speedOverride),
      );
    }
    groups.set(move.exit, landing(movers, move.count, state.groups.get(move.exit)));
    return { ...state, groups };
  };

  /**
   * Standing still is a choice, not the absence of one (§4, D5). It changes
   * neither occupancy nor `spent`, and it banks nothing — so the state it was
   * handed, which is immutable, is already the answer.
   */
  const applySkip = (state: GameState, move: SkipMove): GameState => {
    requireActive(state, move.from);
    return state;
  };

  /** MVP is two players in turn order (§4); a foreign active player fails loudly. */
  const nextPlayer = (state: GameState): PlayerId => {
    const [first, second] = state.players;
    if (state.activePlayer === first) return second;
    if (state.activePlayer === second) return first;
    return reject(`${String(state.activePlayer)} is not one of this match's players`);
  };

  /**
   * The turn ends only here (D6). Nothing survives the boundary: every `spent`
   * counter is zeroed and every merge override is dropped (§3, §11 item 20).
   * Ending with allowance unspent is ordinary play, so no exhaustion is required.
   */
  const applyEndTurn = (state: GameState): GameState => ({
    ...state,
    activePlayer: nextPlayer(state),
    groups: new Map(
      [...state.groups].map(([arrow, group]) => [arrow, asGroup(group.owner, group.heads, 0)]),
    ),
  });

  /**
   * The active player's groups that still have a whole step left, in arrow-id
   * order.
   *
   * Sorted rather than taken as the map hands them over: ADR 0001 names ordering,
   * not randomness, as the realistic determinism failure, and an engine that read
   * an insertion-ordered map into an ordered answer would pass every example here
   * and drift in replay.
   */
  const movable = (state: GameState): readonly (readonly [ArrowId, Group])[] =>
    [...state.groups]
      .filter(([, group]) => group.owner === state.activePlayer && group.spent < allowanceOf(group))
      .toSorted(([left], [right]) => compareArrows(left, right));

  /**
   * Every move the active player may make.
   *
   * A group with allowance offers each portion of itself down each landable exit
   * — splitting, merging and forking are all a step with a different `count`
   * (§4, contracts/move.ts) — and the skip that declines to move it. When no
   * group has a whole step left, that leaves `endTurn` alone (D6, confirmed):
   * exhaustion restricts the offer rather than advancing the player behind their
   * back.
   */
  const legalMoves = (state: GameState): readonly Move[] => {
    const moves: Move[] = [];
    for (const [arrow, group] of movable(state)) {
      for (const exit of exitsFrom(arrow)) {
        if (!canLand(state, exit)) continue;
        for (let count = 1; count <= group.heads; count += 1) {
          moves.push(step(arrow, exit, count));
        }
      }
      moves.push(skip(arrow));
    }
    moves.push(endTurn());
    return moves;
  };

  const apply = (state: GameState, move: Move): GameState => {
    switch (move.kind) {
      case 'step':
        return applyStep(state, move);
      case 'skip':
        return applySkip(state, move);
      case 'endTurn':
        return applyEndTurn(state);
    }
  };

  // P05's half of the port. Trail marking and branch anchors are not wired into
  // `apply` yet — phase 3 does that — so the movement rules above still answer
  // exactly what P04 approved, and every trail scenario is red for the right
  // reason rather than for a compile error.
  const trails = makeTrailRules(geometry);

  return {
    legalMoves,
    apply,
    effectiveSpeed: (state: GameState, arrow: ArrowId): number =>
      allowanceOf(groupOn(state, arrow)),
    trailChordsAt: trails.trailChordsAt,
    crossesTrail: trails.crossesTrail,
    selfCrosses: trails.selfCrosses,
    anchorGrade: trails.anchorGrade,
  };
};
