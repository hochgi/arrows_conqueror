/**
 * The Rule *a record that runs past the win stops there* — three scenarios, all
 * three about the reported playtest log, plus invariants 5 and 6.
 *
 * The log is worth more than every hand-authored scenario in this packet put
 * together: 1247 real moves over the generated tiling, folded through the same pure
 * `apply` the adapter used. It is also the one place the cost of P38 is visible —
 * *"a replay that runs past the win now throws"* — and the packet accepts that
 * cost explicitly, because the alternative is an `apply` that absorbs a caller bug
 * in silence.
 *
 * Measured against `main` @ `fc5bc2e`: the deciding step is **1242**, and the four
 * moves recorded after it are an `endTurn` (1243), a step by a seat that no longer
 * exists (1244), and two more end-turns (1245, 1246). P37 stopped the fold at 1244
 * — because a dead seat moved, not because the match was over. P38 stops it at
 * **1243**, which is the first move that should never have been accepted.
 *
 * @see docs/spec/won-is-over/won-is-over.md
 * @see .claude/skills/rules-invariants/SKILL.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, movesEqual } from '@conquarrow/contracts';
import type { Move } from '@conquarrow/contracts';
import { replay, replayIsDeterministic } from '../src/replay';
import { statesAlong } from './immediate.support';
import { snapshot } from './support';
import {
  DECIDING_MOVE,
  FIRST_MOVE_AFTER_THE_WIN,
  FIRST_MOVE_BY_A_DEAD_SEAT,
  slicedAt,
  theReportedLog,
} from './won-is-over.support';

/** How many moves the record carries after the deciding one. */
const MOVES_RECORDED_AFTER_THE_WIN = 4;

let TRACE: ReturnType<typeof statesAlong> | undefined;

/**
 * The one fold of the record, memoised.
 *
 * Safe *because* the core is pure: the same record over the same board is the same
 * trace, which is the property this file exists to assert.
 */
const theTrace = (): ReturnType<typeof statesAlong> => {
  const { initial, moves, rules } = theReportedLog();
  TRACE ??= statesAlong(rules, initial, moves);
  return TRACE;
};

const moveAt = (moves: readonly Move[], at: number): Move => {
  const move = moves[at];
  if (move === undefined) throw new Error(`setup: the record has no move ${String(at)}`);
  return move;
};

// ── Rule: A record that runs past the win stops there ────────────────────────

describe('a record that runs past the win stops there', () => {
  it('sets the winner on 1242 and refuses at 1243, naming the move it refused', () => {
    // Invariants 5 and 6. The index and the *reason* are one assertion on purpose:
    // 1244 would also be "a stop somewhere sensible", and it is the answer P37 gave
    // for a reason P38 replaces. 1243 is an `endTurn` by the seat that had just won,
    // and nothing but this packet was ever going to stop it.
    const { moves, winner } = theReportedLog();

    const { stops, refusedAt } = theTrace();
    const deciding = stops.find((stop) => stop.at === DECIDING_MOVE);

    if (deciding === undefined) throw new Error('setup: the record is shorter than 1242');
    expect({
      winnerAt: stops.find((stop) => stop.state.winner !== undefined)?.at,
      crowned: String(deciding.state.winner),
      refusedAt,
      refusedKind: moveAt(moves, FIRST_MOVE_AFTER_THE_WIN).kind,
      lastStop: stops[stops.length - 1]?.at,
    }).toEqual({
      winnerAt: DECIDING_MOVE,
      crowned: winner,
      refusedAt: FIRST_MOVE_AFTER_THE_WIN,
      refusedKind: 'endTurn',
      lastStop: DECIDING_MOVE,
    });
  });

  it('names the refused move in the error the fold raises', () => {
    // *And the refused move is named.* An index alone is not enough for a caller
    // holding a record it did not author — the message has to say what it refused,
    // which is what `replay` puts in it.
    const { initial, moves, rules } = theReportedLog();
    const refused = moveAt(moves, FIRST_MOVE_AFTER_THE_WIN);

    let message: string | undefined;
    try {
      replay(rules, initial, moves);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      expect(error).toBeInstanceOf(ContractViolation);
    }

    expect(message).toBeDefined();
    expect(String(message)).toContain(JSON.stringify(refused));
  });

  it('folds the record cleanly when it is sliced at the win', () => {
    // The fixture is sliced rather than folded whole, and that is a reading of the
    // log rather than a workaround: the moves past 1242 were accepted by an engine
    // that had not noticed the match was decided.
    const { initial, moves, rules, winner } = theReportedLog();
    const playable = slicedAt(moves, FIRST_MOVE_AFTER_THE_WIN);
    expect(playable.length).toBe(DECIDING_MOVE + 1);

    const final = replay(rules, initial, playable);

    expect(String(final.winner)).toBe(winner);
  });

  it('reproduces an identical board from the sliced record, twice', () => {
    // The replay layer's own reason for existing: the same record over the same
    // board is the same board, so any accidental nondeterminism the new gate
    // introduced — an offer list built off an unordered walk, say — shows up here
    // rather than as a desync.
    const { initial, moves, rules } = theReportedLog();
    const playable = slicedAt(moves, FIRST_MOVE_AFTER_THE_WIN);

    expect(replayIsDeterministic(rules, initial, playable, snapshot)).toBe(true);
  });

  it('treats none of the four moves recorded after 1242 as legal', () => {
    // *The record's own tail is not evidence of a rule.* Asserted as the tail being
    // both present and unplayed: four moves are on the record after the deciding
    // one, the fold's last state is the deciding one's, and the seat-that-no-longer-
    // exists move at 1244 — the only one P37 could stop — is never reached at all.
    const { moves } = theReportedLog();

    const { stops, refusedAt } = theTrace();

    expect({
      recorded: moves.length - (DECIDING_MOVE + 1),
      total: moves.length,
      played: stops.filter((stop) => stop.at > DECIDING_MOVE).map((stop) => stop.at),
      stoppedBeforeTheDeadSeat: refusedAt !== undefined && refusedAt < FIRST_MOVE_BY_A_DEAD_SEAT,
    }).toEqual({
      recorded: MOVES_RECORDED_AFTER_THE_WIN,
      total: 1247,
      played: [],
      stoppedBeforeTheDeadSeat: true,
    });
  });

  it('offers nothing at all in the state the record stops in', () => {
    // Invariant 1, on the state a real match actually reached. The fold stops
    // because the offer list is empty, not because the move happened to be one no
    // rule permitted: every move kind the record could have carried next is absent,
    // the pass included.
    const { rules } = theReportedLog();

    const { stops } = theTrace();
    const decided = stops.find((stop) => stop.at === DECIDING_MOVE);

    if (decided === undefined) throw new Error('setup: the record is shorter than 1242');
    expect(rules.legalMoves(decided.state)).toEqual([]);
  });

  it('refuses the recorded 1243 against the state the record left off in', () => {
    // Invariant 2 on the same state, and the pair that makes the standing invariant
    // *everything `legalMoves` offers, `apply` accepts* hold in both directions
    // here: nothing is offered, and the move the record carries is refused rather
    // than quietly folded into a state that looks unchanged.
    const { moves, rules } = theReportedLog();
    const refused = moveAt(moves, FIRST_MOVE_AFTER_THE_WIN);

    const { stops } = theTrace();
    const decided = stops.find((stop) => stop.at === DECIDING_MOVE);

    if (decided === undefined) throw new Error('setup: the record is shorter than 1242');
    const before = snapshot(decided.state);
    expect(() => rules.apply(decided.state, refused)).toThrow(ContractViolation);
    expect(snapshot(decided.state)).toEqual(before);
  });

  it('records the very move the packet was filed over at 1243', () => {
    // A guard on the fixture, not on the engine. Every index in this file is a
    // measurement, and a fixture that was re-recorded or re-ordered would turn all
    // of them into assertions about nothing in particular.
    const { moves } = theReportedLog();

    expect({
      atTheWin: moveAt(moves, DECIDING_MOVE).kind,
      after: moveAt(moves, FIRST_MOVE_AFTER_THE_WIN).kind,
      deadSeat: moveAt(moves, FIRST_MOVE_BY_A_DEAD_SEAT).kind,
      tail: moves.slice(FIRST_MOVE_AFTER_THE_WIN).map((move) => move.kind),
      sameMove: movesEqual(
        moveAt(moves, FIRST_MOVE_AFTER_THE_WIN),
        moveAt(moves, FIRST_MOVE_AFTER_THE_WIN),
      ),
    }).toEqual({
      atTheWin: 'step',
      after: 'endTurn',
      deadSeat: 'step',
      tail: ['endTurn', 'step', 'endTurn', 'endTurn'],
      sameMove: true,
    });
  });
});
