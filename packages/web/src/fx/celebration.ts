/**
 * When the celebration begins.
 *
 * `victoryFx` (`./victory`) reads `state.winner` and nothing else, so before P38
 * the dim-everything-but-the-winner treatment painted on the same frame the
 * winning move committed, over that move's own overlays. The winning move is the
 * most spectacular move in the game — a closure that fills ground, converts a
 * stack and vanishes a seat — and the player saw the win announced and missed the
 * thing that won it.
 *
 * This is the seam that fixes it, and it is a *new* module rather than a change to
 * `victoryFx` for two reasons. `victoryFx` is a pure reading of frozen state and
 * `victory-fx.invariants.test.ts` pins its arity at two on purpose (P29: "no extra
 * adapter field"); and *when* the celebration starts is a fact about the fx queue
 * and a clock, which is not something a reading of `GameState` can know.
 *
 * Three exports, one per thing the adapter needs:
 *
 * - {@link celebrationPhase} — the gate: has the deciding move finished playing?
 * - {@link victoryAt} — the board's reading, gated on that. This is what
 *   `App.tsx`'s `victory` memo becomes.
 * - {@link matchLocked} — the input lock, which reads `winner` and **not** the
 *   celebration. `Hud` used to lock on `controlsLocked(victory)`; once `victory`
 *   reads *playing* during the wait, that unlocks the board for the length of the
 *   winning move's animation. Invariant 12 forbids exactly that.
 *
 * Everything here is pure and takes `now` as an argument. The clock enters the
 * adapter in `App.tsx` and nowhere deeper — the same rule `fx/queue.ts` keeps — so
 * that given the same overlays and the same stamps this behaves identically, and a
 * replay's *presentation* stays reproducible along with its state.
 *
 * @see docs/spec/won-is-over/won-is-over.md — *When the celebration begins*
 */

import type { GameState, GeometryPort } from '@conquarrow/contracts';
import type { FxItem } from './queue';
import { overlayLifetimeMs } from './present';
import { victoryFx, type VictoryFx } from './victory';

/**
 * Where the deciding move's effects have got to.
 *
 * `decidedAt` is the instant `winner` was first seen — stamped once, by the same
 * `Date.now()` call that stamps the move's overlays, so the two are on one clock.
 * `undefined` means no winner has been seen yet.
 */
export interface CelebrationClock {
  readonly decidedAt: number | undefined;
  readonly now: number;
  readonly queue: readonly FxItem[];
}

/** `'playing'` until the deciding move's overlays have finished; `'over'` after. */
export type CelebrationPhase = 'playing' | 'over';

/** No winner seen, or the wait is over — never a state of its own. */
const PLAYING: VictoryFx = { kind: 'playing' };

/**
 * How long after `decidedAt` the celebration is due — the settle time of the
 * overlays that were **already queued when the deciding move committed**.
 *
 * This one number is both the trigger and the bound, and that is the correction the
 * spec records. Queue-empty is the trigger and is *self-bounding*: `pruneQueue`
 * drops every item on its own lifetime so nothing outlives itself, and after the
 * deciding move nothing can enqueue, because P38's rules half refuses every
 * subsequent move and `inputLocked` is already true. So the instant the last of
 * these overlays finishes is exactly the instant the live queue empties.
 *
 * Two properties earn the shape:
 *
 * - **It is never shorter than the move it waits for.** A fixed ceiling was, and by
 *   500 ms: `MAJOR_SEQUENCE_MS` is 700 and the packet's headline move — a closure
 *   that fills ground and converts a stack — settles at 1200, because
 *   `captureFresh` is offset 500 with a duration of 700. Taken from the queue it
 *   cannot go stale when a timing value moves, either.
 * - **It ignores anything that arrived after the win**, which is the only way the
 *   live queue can stay busy and therefore the only bug there is to guard against.
 *   A stray overlay enqueued past the deciding move cannot delay the celebration.
 *
 * `0` when nothing was queued at that instant: there is nothing to wait for, and a
 * fixed pause there would not be monotone — the prune timer empties the queue at
 * `settle + 40`, so a constant floor would flip the banner on at the settle, off
 * again when the queue emptied below the floor, and on again at the floor. Invariant
 * 13 (*exactly once per match*) outranks a nominal ceiling with nothing under it.
 */
const dueMs = (queue: readonly FxItem[], decidedAt: number): number => {
  let due = 0;
  for (const item of queue) {
    if (item.startedAt > decidedAt) continue;
    due = Math.max(due, item.startedAt + overlayLifetimeMs(item.overlay) - decidedAt);
  }
  return due;
};

export const celebrationPhase = (clock: CelebrationClock): CelebrationPhase => {
  const { decidedAt } = clock;
  if (decidedAt === undefined) return 'playing';
  return clock.now - decidedAt >= dueMs(clock.queue, decidedAt) ? 'over' : 'playing';
};

/**
 * The board's victory reading, gated on the celebration having begun.
 *
 * `victoryFx(state, geometry)` while {@link celebrationPhase} is `'over'`, and
 * `{ kind: 'playing' }` before that — no dim, no shine, no banner. The transition
 * is what carries the meaning.
 */
export const victoryAt = (
  state: GameState | undefined,
  geometry: GeometryPort,
  clock: CelebrationClock,
): VictoryFx => {
  if (state === undefined) return PLAYING;
  if (celebrationPhase(clock) === 'playing') return PLAYING;
  return victoryFx(state, geometry);
};

/**
 * Whether the board is locked to input — from the deciding move onward.
 *
 * Reads `winner` and nothing else. Not the celebration, and not the queue: the fx
 * queue's own contract is that it never gates input, and input here is already
 * locked by the *rules*, from the frame the deciding move commits.
 */
export const matchLocked = (state: GameState | undefined): boolean =>
  state?.winner !== undefined;

/** How long until the celebration is due, in ms — `0` once it is. */
export const celebrationWaitMs = (clock: CelebrationClock): number => {
  const { decidedAt } = clock;
  if (decidedAt === undefined) return 0;
  return Math.max(0, dueMs(clock.queue, decidedAt) - (clock.now - decidedAt));
};
