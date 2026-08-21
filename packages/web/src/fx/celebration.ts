/**
 * **Skeleton — P38 phase 2. Signatures and types only; phase 3 owns the bodies.**
 *
 * When the celebration begins.
 *
 * `victoryFx` (`./victory`) reads `state.winner` and nothing else, so today the
 * dim-everything-but-the-winner treatment paints on the same frame the winning move
 * commits, over that move's own overlays. The winning move is the most spectacular
 * move in the game — a closure that fills ground, converts a stack and vanishes a
 * seat — and the player currently sees the win announced and misses the thing that
 * won it.
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
 *   celebration. `Hud` currently locks on `controlsLocked(victory)`; once `victory`
 *   reads *playing* during the wait, that would unlock the board for the length of
 *   the winning move's animation. Invariant 12 forbids exactly that.
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
import type { VictoryFx } from './victory';

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

/**
 * `'playing'` until the deciding move's overlays have finished; `'over'` after.
 *
 * Bounded on purpose. The queue is lossy by design — overlays are dropped past
 * `MAX_FX_ITEMS` and pruned on their own lifetimes — so *wait until the queue is
 * empty* alone could strand a match with no celebration at all if the deciding
 * move's overlay were ever dropped mid-flight. The ceiling is `MAJOR_SEQUENCE_MS`,
 * already the stated bound on the biggest sequence in the game, which makes the
 * failure mode "the celebration came slightly early" rather than "the match never
 * visibly ended".
 */
export type CelebrationPhase = 'playing' | 'over';

export const celebrationPhase = (clock: CelebrationClock): CelebrationPhase =>
  notImplemented(`celebrationPhase at ${String(clock.now)}`);

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
): VictoryFx =>
  notImplemented(
    `victoryAt for ${String(state?.winner)} at ${String(clock.now)} on ${geometry.constructor.name}`,
  );

/**
 * Whether the board is locked to input — from the deciding move onward.
 *
 * Reads `winner` and nothing else. Not the celebration, and not the queue: the fx
 * queue's own contract is that it never gates input, and input here is already
 * locked by the *rules*, from the frame the deciding move commits.
 */
export const matchLocked = (state: GameState | undefined): boolean =>
  notImplemented(`matchLocked for ${String(state?.winner)}`);

const notImplemented = (what: string): never => {
  throw new Error(`P38 skeleton: ${what} is not implemented`);
};
