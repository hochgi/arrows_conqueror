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
import { makeCombatRules, resolveBattle } from './combat';
import { makeClosureRules } from './closure';
import { makeCutRules } from './cuts';
import { compareArrows } from './order';
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

/**
 * Build the movement rules over a board.
 *
 * The board arrives as a port and nothing else — the engine never learns which
 * implementation it got, so a hand-authored fixture (P02) and the generated
 * tiling (P03) satisfy the same rules unchanged.
 */
export const makeRules = (geometry: GeometryPort): RulesPort => {
  // P05's half of the port: what a step marks, what a branch costs, and who
  // crossed whom. Movement asks it two questions — `requireBranchAnchors` before a
  // step is written and `markStep` as it is — and exposes the rest unchanged.
  const trails = makeTrailRules(geometry);
  // P05b's half: what a landing claims, and what the claimed ground rings.
  const closure = makeClosureRules(geometry);
  // P06: contact-combat losses (query) and cut evaporation after a step.
  const combat = makeCombatRules(geometry);
  const cuts = makeCutRules(geometry);

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
   * What stands on the destination once the step has landed on empty ground or
   * the mover's own group.
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
   *
   * Enemy-occupied destinations are legal here: contact combat (§6.2) resolves
   * them inside `applyStep` rather than refusing the step.
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
    return movers;
  };

  /**
   * §6.2 / item 38: an attack may not empty `from` — stay-behind ≥ 1. A lone
   * head therefore cannot attack. Refuse rather than silently capping.
   */
  const requireStayBehind = (movers: Group, move: StepMove, contact: Group): void => {
    if (movers.heads < 2 || move.count > movers.heads - 1) {
      reject(
        `attack from ${String(move.from)} onto ${String(contact.owner)} on ${String(move.exit)} must leave at least one head behind (heads=${String(movers.heads)}, count=${String(move.count)})`,
      );
    }
  };

  /**
   * Write the split remainder on `from` after `count` heads leave (or die).
   */
  const leaveRemainder = (
    groups: Map<ArrowId, Group>,
    from: ArrowId,
    movers: Group,
    count: number,
  ): void => {
    const remainder = movers.heads - count;
    if (remainder === 0) {
      groups.delete(from);
    } else {
      groups.set(from, asGroup(movers.owner, remainder, movers.spent, movers.speedOverride));
    }
  };

  /**
   * A step: occupancy (ordinary or contact combat), then the mark it leaves,
   * then cut evaporation, then closure.
   *
   * The branch mandate is asked **before** anything is written, against the trail
   * the move would leave (§5, P05 D6) — an illegal move is never a plausible no-op
   * (P04 D2), so a step that cannot pay for a branch must not have moved anything.
   *
   * P06 D6: combat (when contact) first, then cut against the trail set, then
   * closure. `evaporate` / `commit` are no-ops when the step is neither.
   */
  const applyStep = (state: GameState, move: StepMove): GameState => {
    const movers = moversFor(state, move);
    trails.requireBranchAnchors(state, move, movers.owner);
    const groups = new Map(state.groups);
    const standing = state.groups.get(move.exit);
    const contact =
      standing !== undefined && standing.owner !== movers.owner ? standing : undefined;

    let landed = true;
    if (contact !== undefined) {
      // §6.2 / item 38: stay-behind, fight-to-wipe, mark only on land.
      requireStayBehind(movers, move, contact);
      const { aRem, dRem } = resolveBattle(move.count, contact.heads);
      leaveRemainder(groups, move.from, movers, move.count);
      if (dRem === 0) {
        // Attacker lands with A remaining — ordinary occupancy on emptied ground.
        landed = true;
        if (aRem === 0) {
          groups.delete(move.exit);
        } else {
          groups.set(move.exit, asGroup(movers.owner, aRem, movers.spent + 1, movers.speedOverride));
        }
      } else {
        // Attacker wiped — stay-behind is the tip; do not mark the destination.
        landed = false;
        groups.set(move.exit, asGroup(contact.owner, dRem, contact.spent, contact.speedOverride));
      }
    } else {
      // A split leaves the remainder its parent's `spent` and its parent's override,
      // and only the movers pay for the step (§3; SPEC §11 item 33).
      leaveRemainder(groups, move.from, movers, move.count);
      groups.set(move.exit, landing(movers, move.count, standing));
    }

    const stepped: GameState = {
      ...state,
      groups,
      trails: landed ? trails.markStep(state, move, movers.owner) : state.trails,
    };
    const afterCut = cuts.evaporate(stepped, move, movers.owner);
    // A closure is an ordinary step onto your own territory (§7, P05b D1), so it is
    // resolved here rather than behind a move kind of its own. `commit` returns the
    // state untouched when the step is not one, which keeps this a single expression.
    //
    // Handed the *post-cut* state on purpose: `move.from` is still in the trail —
    // marking only ever adds — and the backward walk reads no head positions, so the
    // claim is identical either side of the move. A cut mid-closure is the victim's
    // problem on the cutter's turn, not a reorder here.
    return closure.commit(afterCut, move, movers.owner);
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
   *
   * A portion that would leave a branch of the mover's own trail unpaid is withheld
   * (§5, P05 D6). The port promises that anything it names, `apply` accepts, so the
   * mandate has to be read here and not only there — otherwise a player following
   * the engine's own advice gets refused, and a replay could record a move the rules
   * reject. A group with allowance whose every step is withheld still offers its
   * `skip`: §5 leaves such a head standing, immobile until reinforced, and declining
   * is always legal (§6.2).
   */
  const legalMoves = (state: GameState): readonly Move[] => {
    const moves: Move[] = [];
    for (const [arrow, group] of movable(state)) {
      for (const exit of exitsFrom(arrow)) {
        // Enemy-occupied exits: stay-behind (§6.2 / item 38) — offer 1..heads-1 only.
        const standing = state.groups.get(exit);
        const isAttack = standing !== undefined && standing.owner !== group.owner;
        const maxCount = isAttack ? group.heads - 1 : group.heads;
        for (let count = 1; count <= maxCount; count += 1) {
          const candidate = step(arrow, exit, count);
          if (trails.unpaidBranch(state, candidate, group.owner) !== undefined) continue;
          moves.push(candidate);
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

  return {
    legalMoves,
    apply,
    effectiveSpeed: (state: GameState, arrow: ArrowId): number =>
      allowanceOf(groupOn(state, arrow)),
    trailChordsAt: trails.trailChordsAt,
    crossesTrail: trails.crossesTrail,
    selfCrosses: trails.selfCrosses,
    anchorGrade: trails.anchorGrade,
    closureOf: closure.closureOf,
    enclosedBy: closure.enclosedBy,
    combatLosses: combat.combatLosses,
  };
};
