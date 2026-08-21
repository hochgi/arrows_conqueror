/**
 * The Rule *the celebration waits for the effects that won the match* — five
 * scenarios from docs/spec/won-is-over/won-is-over.edge-cases.feature, plus
 * invariants 10–13.
 *
 * Written against `src/fx/celebration.ts`, which is **new in P38 and a skeleton at
 * the time these tests were written**. That seam exists because the celebration's
 * timing is not reachable otherwise: `App.tsx` derives it in a `useMemo` inside a
 * 1200-line component, React is deliberately kept out of vitest here, and the
 * decision itself is a pure function of `(winner, decidedAt, now, queue)`. Testing
 * it through the component would need a renderer this package does not have, and
 * re-deriving the rule inside the test would only assert the test.
 *
 * Two things about the boundary these tests pin, both measured rather than assumed:
 *
 * - The feature's own Given — *a closure that fills ground and converts a stack* —
 *   queues overlays that run **1200 ms**, which is longer than `MAJOR_SEQUENCE_MS`
 *   (700), because `captureFresh` is offset 500 with a duration of 700. So a fixed
 *   700 ms ceiling would start the celebration *on top of* `captureFresh`, 500 ms
 *   early — a smaller copy of the bug this packet exists to fix. The wait is taken
 *   from the queue instead, and the numbers are asserted here rather than left
 *   implicit.
 * - Because of that, on the headline move "wait for the overlays" and "wait 700 ms"
 *   give different answers, and 1200 is the right one. `aQuietDecidingMove` — whose
 *   overlays are over at 680 — pins the other side: the wait is shorter than 700
 *   there, so nothing has silently become a constant.
 *
 * @see docs/spec/won-is-over/won-is-over.md — *When the celebration begins*
 */

import { describe, expect, it } from 'vitest';
import { celebrationPhase, celebrationWaitMs, matchLocked, victoryAt } from '../src/fx/celebration';
import type { CelebrationClock } from '../src/fx/celebration';
import { emptyQueue, enqueue, queueSettleMs } from '../src/fx/queue';
import { MAJOR_SEQUENCE_MS } from '../src/fx/timing';
import { isMatchOverDimmed } from '../src/fx/victory';
import type { VictoryFx } from '../src/fx/victory';
import {
  T0,
  aDecidingMove,
  aQuietDecidingMove,
  geometry,
  overlaysDroppedUnderPressure,
  strangerArrow,
} from './won-is-over.support';
import type { DecidingMove } from './won-is-over.support';

const bannerOf = (fx: VictoryFx): string | undefined =>
  fx.kind === 'over' ? fx.banner : undefined;

/** The clock the adapter holds `ms` after the deciding move committed. */
const clockAt = (deciding: DecidingMove, ms: number): CelebrationClock => ({
  decidedAt: T0,
  now: T0 + ms,
  queue: deciding.queue,
});

/**
 * When the celebration is due: the instant the deciding move's overlays settle.
 *
 * Invariant 10 gives it and invariant 11 bounds it *by the same number* — the
 * ceiling is taken from the queue rather than from a constant, precisely so that it
 * cannot be shorter than the move it waits for. Read off the fixture's own measured
 * `settleMs`, not recomputed here, so this asserts the implementation rather than
 * restating it.
 */
const dueAfter = (deciding: DecidingMove): number => deciding.settleMs;

// ── Rule: the celebration waits for the effects that won the match ───────────

describe('the celebration waits for the effects that won the match', () => {
  it('reads the board as playing while the deciding move animates', () => {
    // No dim, no shine, no banner while the closure is filling ground and the stack
    // is changing hands. The transition is what carries the meaning, so the board
    // has to still look like a board being played on.
    const deciding = aDecidingMove();
    expect(String(deciding.after.winner)).toBe('A');
    expect(queueSettleMs(deciding.queue, T0)).toBeGreaterThan(0);

    const fx = victoryAt(deciding.after, geometry, clockAt(deciding, 0));

    expect({
      phase: celebrationPhase(clockAt(deciding, 0)),
      kind: fx.kind,
      dimmed: isMatchOverDimmed(fx, strangerArrow(), deciding.after),
      banner: bannerOf(fx),
    }).toEqual({ phase: 'playing', kind: 'playing', dimmed: false, banner: undefined });
  });

  it('keeps reading as playing at every instant before the celebration is due', () => {
    // The other half of *while it animates*: not merely on the committing frame, but
    // right up to the boundary. A `> 0` check on the queue that happened to be true
    // only on the first frame would pass the assertion above and fail this one.
    const deciding = aDecidingMove();
    const due = dueAfter(deciding);

    const phases = [0, 1, Math.floor(due / 2), due - 1].map((ms) => ({
      ms,
      phase: celebrationPhase(clockAt(deciding, ms)),
    }));

    expect(phases).toEqual(phases.map(({ ms }) => ({ ms, phase: 'playing' })));
  });

  it('begins the celebration once those overlays have finished', () => {
    // The feature's Given, at the instant the celebration is due: 1200 ms, when
    // `captureFresh` has finished. Asserted alongside the fact that those overlays
    // outlive `MAJOR_SEQUENCE_MS`, because that is what makes the assertion
    // load-bearing — a fixed 700 ms ceiling would have fired here 500 ms ago.
    const deciding = aDecidingMove();

    const fx = victoryAt(deciding.after, geometry, clockAt(deciding, dueAfter(deciding)));

    expect({
      phase: celebrationPhase(clockAt(deciding, dueAfter(deciding))),
      kind: fx.kind,
      dimmed: isMatchOverDimmed(fx, strangerArrow(), deciding.after),
      banner: bannerOf(fx),
      dueAt: dueAfter(deciding),
      outlivesMajorSequenceMs: deciding.settleMs > MAJOR_SEQUENCE_MS,
    }).toEqual({
      phase: 'over',
      kind: 'over',
      dimmed: true,
      banner: 'Player A wins',
      dueAt: 1200,
      outlivesMajorSequenceMs: true,
    });
  });

  it('waits for the queue rather than the ceiling when the queue is the shorter of the two', () => {
    // The move that distinguishes an implementation which consults the queue from
    // one which always waits `MAJOR_SEQUENCE_MS`: A wins on a step that only
    // advances a head and takes the last seat's land, so the overlays are over at
    // 680 ms and the celebration is due then and not at 700.
    const quiet = aQuietDecidingMove();
    expect(quiet.settleMs).toBeLessThan(MAJOR_SEQUENCE_MS);

    expect({
      justBefore: celebrationPhase(clockAt(quiet, quiet.settleMs - 1)),
      atSettle: celebrationPhase(clockAt(quiet, quiet.settleMs)),
      atCeiling: celebrationPhase(clockAt(quiet, MAJOR_SEQUENCE_MS)),
    }).toEqual({ justBefore: 'playing', atSettle: 'over', atCeiling: 'over' });
  });

  it('lets a dropped overlay bring the celebration forward, never strand it', () => {
    // The queue is lossy by design: past `MAX_FX_ITEMS` the oldest items of the
    // least important tier go, and on a frame where a burst of major effects lands
    // the deciding move's own overlays are the oldest tier-1 items present. Here
    // they are gone entirely.
    //
    // Losing them cannot strand the match, and the direction is what the first draft
    // of this scenario had backwards: `pruneQueue` drops every item on its own
    // lifetime, so nothing outlives itself, and after the win nothing can enqueue —
    // this packet's own rules half refuses every move. So the wait is over no later
    // than it would have been with the overlays intact, and the celebration begins
    // when the *survivors* finish.
    const { deciding, queue, droppedIds } = overlaysDroppedUnderPressure();
    const live = new Set(queue.map((item) => item.overlay.id));
    const surviving = queueSettleMs(queue, T0);
    const clockAtSettle: CelebrationClock = { decidedAt: T0, now: T0 + surviving, queue };

    expect({
      atSurvivorsSettle: celebrationPhase(clockAtSettle),
      justBefore: celebrationPhase({ decidedAt: T0, now: T0 + surviving - 1, queue }),
      anyDecidingOverlayLeft: droppedIds.some((id) => live.has(id)),
      noLaterThanIntact: surviving <= deciding.settleMs,
      winner: String(deciding.after.winner),
    }).toEqual({
      atSurvivorsSettle: 'over',
      justBefore: 'playing',
      anyDecidingOverlayLeft: false,
      noLaterThanIntact: true,
      winner: 'A',
    });
  });

  it('begins once and does not begin again when the board re-renders', () => {
    // A re-render is another call with a later `now` and a queue that has only lost
    // items. So *begins once* is monotonicity plus purity: once over, over at every
    // later instant and at every queue state a prune could produce, and the same
    // question asked twice gives the same answer.
    const deciding = aDecidingMove();
    const due = dueAfter(deciding);
    const later = [due, due + 1, due + 500, due + 10_000];

    const rerenders = later.flatMap((ms) => [
      { ms, queue: 'the move’s own', phase: celebrationPhase(clockAt(deciding, ms)) },
      {
        ms,
        queue: 'pruned empty',
        phase: celebrationPhase({ decidedAt: T0, now: T0 + ms, queue: emptyQueue() }),
      },
    ]);
    const asked = [0, 1, 2].map(() => celebrationPhase(clockAt(deciding, due)));

    expect(rerenders).toEqual(rerenders.map(({ ms, queue }) => ({ ms, queue, phase: 'over' })));
    expect(asked).toEqual(['over', 'over', 'over']);
  });

  it('does not unlock input while the deciding move is still playing', () => {
    // `inputLocked` reads `winner !== undefined`, which is true from the deciding
    // move onward — so the wait costs the player nothing, and the fx queue's contract
    // that it never gates input is intact. Asserted as *the lock does not move with
    // the queue*: the same state, three queue states and both phases, one answer.
    const deciding = aDecidingMove();
    const clocks: readonly (readonly [string, CelebrationClock])[] = [
      ['on the committing frame', clockAt(deciding, 0)],
      ['mid-animation', clockAt(deciding, Math.floor(dueAfter(deciding) / 2))],
      ['once the celebration has begun', clockAt(deciding, dueAfter(deciding))],
      ['with an empty queue', { decidedAt: T0, now: T0, queue: emptyQueue() }],
    ];

    const locks = clocks.map(([where, clock]) => ({
      where,
      phase: celebrationPhase(clock),
      locked: matchLocked(deciding.after),
    }));

    expect(locks.map(({ where, locked }) => ({ where, locked }))).toEqual(
      clocks.map(([where]) => ({ where, locked: true })),
    );
    // Non-vacuous: the same reading of the board *before* the deciding move is open.
    expect(matchLocked(deciding.before)).toBe(false);
    // And the lock is genuinely independent of where the celebration has got to.
    expect(new Set(locks.map(({ phase }) => phase)).size).toBeGreaterThan(1);
  });
});

// ── Invariants 10–13 ─────────────────────────────────────────────────────────

describe('the adapter invariants of a won match', () => {
  it('10. presents the board as playing until the deciding move’s overlays have finished, and as over thereafter', () => {
    // The transition itself, over both shapes of deciding move, as one table. A
    // reading that never changed — either always playing or always over — is the
    // whole class of bug this packet exists to remove, and it is what a single
    // instant's assertion cannot catch.
    const moves: readonly (readonly [string, DecidingMove])[] = [
      ['a closure that fills and converts', aDecidingMove()],
      ['a step that takes the last land', aQuietDecidingMove()],
    ];

    const table = moves.map(([name, deciding]) => ({
      name,
      before: celebrationPhase(clockAt(deciding, dueAfter(deciding) - 1)),
      after: celebrationPhase(clockAt(deciding, dueAfter(deciding))),
      readingBefore: victoryAt(deciding.after, geometry, clockAt(deciding, 0)).kind,
      readingAfter: victoryAt(deciding.after, geometry, clockAt(deciding, dueAfter(deciding))).kind,
    }));

    expect(table).toEqual(
      moves.map(([name]) => ({
        name,
        before: 'playing',
        after: 'over',
        readingBefore: 'playing',
        readingAfter: 'over',
      })),
    );
  });

  it('11. begins no earlier than the overlays settle and no later than a ceiling not less than that', () => {
    // Both halves of invariant 11, and the second is the one the spec had to
    // correct: the ceiling is *not less than* the settle time, so it can never fire
    // on top of the move it is waiting for. Quantified over queues rather than
    // asserted on one — the move's own overlays, a queue those were dropped from, an
    // empty queue, and a stray overlay that arrived *after* the win, which is the
    // only way a live queue can outlast the deciding move and therefore the only
    // thing a ceiling has left to guard.
    const deciding = aDecidingMove();
    const dropped = overlaysDroppedUnderPressure();
    const strayAfterTheWin = [
      ...deciding.queue,
      ...enqueue(emptyQueue(), deciding.overlays, T0 + 10 * MAJOR_SEQUENCE_MS),
    ];
    const queues: readonly (readonly [string, readonly (typeof deciding.queue)[number][]])[] = [
      ['the move’s own overlays', [...deciding.queue]],
      ['a queue they were dropped from', [...dropped.queue]],
      ['nothing at all', [...emptyQueue()]],
      ['an overlay that arrived after the win', strayAfterTheWin],
    ];

    const table = queues.map(([name, queue]) => {
      const settle = queueSettleMs(
        queue.filter((item) => item.startedAt <= T0),
        T0,
      );
      return {
        name,
        // Never early: still playing one millisecond before those overlays settle.
        early: settle === 0 ? 'nothing to wait for' : celebrationPhase({ decidedAt: T0, now: T0 + settle - 1, queue }),
        // Never late: over by the instant they settle, whatever else is in the queue.
        atSettle: celebrationPhase({ decidedAt: T0, now: T0 + settle, queue }),
      };
    });

    expect(table).toEqual([
      { name: 'the move’s own overlays', early: 'playing', atSettle: 'over' },
      { name: 'a queue they were dropped from', early: 'playing', atSettle: 'over' },
      { name: 'nothing at all', early: 'nothing to wait for', atSettle: 'over' },
      { name: 'an overlay that arrived after the win', early: 'playing', atSettle: 'over' },
    ]);
    // And the wait the adapter arms its timer with *is* the queue's settle time —
    // which is the whole correction: a fixed `MAJOR_SEQUENCE_MS` would have been
    // 500ms short of the move it was waiting for.
    expect({
      wait: celebrationWaitMs({ decidedAt: T0, now: T0, queue: deciding.queue }),
      ignoringTheStray: celebrationWaitMs({ decidedAt: T0, now: T0, queue: strayAfterTheWin }),
      settle: deciding.settleMs,
      ceiling: MAJOR_SEQUENCE_MS,
    }).toEqual({ wait: 1200, ignoringTheStray: 1200, settle: 1200, ceiling: 700 });
  });

  it('12. does not gate input on the celebration, which is already locked by `winner`', () => {
    // Invariant 12 as a statement about *arity*, which is the only way to say "does
    // not depend on the queue" once and for all: the lock is a function of the state
    // alone, so there is no clock and no queue it could consult.
    const deciding = aDecidingMove();

    expect({
      arity: matchLocked.length,
      won: matchLocked(deciding.after),
      playing: matchLocked(deciding.before),
      noState: matchLocked(undefined),
    }).toEqual({ arity: 1, won: true, playing: false, noState: false });
  });

  it('13. begins the celebration exactly once per match', () => {
    // Counted the only way a pure predicate can be: the number of instants at which
    // the answer *changes* along a monotonically advancing clock. One transition,
    // playing before it and over after it, and never back.
    const deciding = aDecidingMove();
    const ms = [0, 1, 100, 300, 500, 699, 700, 701, 1200, 5000];

    const phases = ms.map((at) => celebrationPhase(clockAt(deciding, at)));

    const flips = phases.filter((phase, index) => index > 0 && phase !== phases[index - 1]);
    expect(flips).toEqual(['over']);
    expect(phases[0]).toBe('playing');
    expect(phases[phases.length - 1]).toBe('over');
  });

  it('reads as playing whenever no winner has been seen at all', () => {
    // The `decidedAt === undefined` arm, which is every frame of a live match. Not a
    // numbered invariant, and the one the other twelve are meaningless without: a
    // gate that read *over* before the match ended would dim a board mid-game.
    const deciding = aDecidingMove();
    const live: CelebrationClock = { decidedAt: undefined, now: T0 + 10_000, queue: emptyQueue() };

    expect({
      phase: celebrationPhase(live),
      reading: victoryAt(deciding.before, geometry, live).kind,
    }).toEqual({ phase: 'playing', reading: 'playing' });
  });
});
