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
 *   queues overlays that run **1200 ms**, which is longer than
 *   `MAJOR_SEQUENCE_MS` (700). So on the packet's headline move the *ceiling* is
 *   what starts the celebration, with `captureFresh` still running. That follows
 *   from invariants 10 and 11 together and needs no new decision, but it is a real
 *   consequence and it is recorded here in numbers rather than left implicit.
 * - Because of that, "wait for the overlays" and "always wait 700 ms" are the same
 *   answer on that move. `aQuietDecidingMove` is the move that tells them apart.
 *
 * @see docs/spec/won-is-over/won-is-over.md — *When the celebration begins*
 */

import { describe, expect, it } from 'vitest';
import { celebrationPhase, matchLocked, victoryAt } from '../src/fx/celebration';
import type { CelebrationClock } from '../src/fx/celebration';
import { emptyQueue, queueSettleMs } from '../src/fx/queue';
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
 * When the celebration is due: the deciding move's overlays finishing, or the
 * ceiling, whichever comes first.
 *
 * Invariant 10 gives the first term and invariant 11 caps it with the second — and
 * it is a `min` rather than a `max` because the ceiling exists precisely for the
 * case where waiting on the queue would wait forever.
 */
const dueAfter = (deciding: DecidingMove): number =>
  Math.min(deciding.settleMs, MAJOR_SEQUENCE_MS);

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
    // The feature's Given, at the instant the celebration is due. On this move the
    // ceiling is what fires — its overlays run past it — so the numbers are asserted
    // alongside the phase rather than left to be inferred.
    const deciding = aDecidingMove();

    const fx = victoryAt(deciding.after, geometry, clockAt(deciding, dueAfter(deciding)));

    expect({
      phase: celebrationPhase(clockAt(deciding, dueAfter(deciding))),
      kind: fx.kind,
      dimmed: isMatchOverDimmed(fx, strangerArrow(), deciding.after),
      banner: bannerOf(fx),
      overlaysOutliveTheCeiling: deciding.settleMs > MAJOR_SEQUENCE_MS,
    }).toEqual({
      phase: 'over',
      kind: 'over',
      dimmed: true,
      banner: 'Player A wins',
      overlaysOutliveTheCeiling: true,
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

  it('does not let a dropped overlay strand the match unannounced', () => {
    // The load-bearing one, and the whole reason the wait is bounded rather than
    // "until the queue is empty". The queue is lossy by design: past `MAX_FX_ITEMS`
    // the oldest items of the least important tier go, and on a frame where a burst
    // of major effects lands the deciding move's own overlays are the oldest tier-1
    // items present. Here they are gone and the queue that displaced them is still
    // running at the ceiling — so an emptiness test would never fire, and the match
    // would end with no visible ending at all.
    const { deciding, queue, droppedIds } = overlaysDroppedUnderPressure();
    const live = new Set(queue.map((item) => item.overlay.id));
    const clock: CelebrationClock = { decidedAt: T0, now: T0 + MAJOR_SEQUENCE_MS, queue };

    const phase = celebrationPhase(clock);

    expect({
      phase,
      anyDecidingOverlayLeft: droppedIds.some((id) => live.has(id)),
      queueStillBusy: queueSettleMs(queue, T0 + MAJOR_SEQUENCE_MS) > 0,
      winner: String(deciding.after.winner),
    }).toEqual({
      phase: 'over',
      anyDecidingOverlayLeft: false,
      queueStillBusy: true,
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

  it('11. begins the celebration no later than MAJOR_SEQUENCE_MS after the deciding move, whatever the queue contains', () => {
    // *Whatever the queue contains* is the operative phrase, so the property is
    // quantified over queues rather than asserted on one: the move's own overlays, a
    // queue those were dropped from, and an empty queue.
    const deciding = aDecidingMove();
    const dropped = overlaysDroppedUnderPressure();
    const queues: readonly (readonly [string, readonly (typeof deciding.queue)[number][]])[] = [
      ['the move’s own overlays', [...deciding.queue]],
      ['a queue they were dropped from', [...dropped.queue]],
      ['nothing at all', [...emptyQueue()]],
    ];

    const atCeiling = queues.map(([name, queue]) => ({
      name,
      phase: celebrationPhase({ decidedAt: T0, now: T0 + MAJOR_SEQUENCE_MS, queue }),
    }));

    expect(atCeiling).toEqual(queues.map(([name]) => ({ name, phase: 'over' })));
    expect(MAJOR_SEQUENCE_MS).toBe(700);
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
