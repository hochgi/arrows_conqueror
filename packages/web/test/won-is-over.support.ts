/**
 * Fixtures for the celebration half of P38 (invariants 10–13).
 *
 * The question these tests ask is *when*, so everything here is built around a
 * single stamped instant `T0` — the frame the deciding move commits — and a queue
 * holding that move's own overlays. No `Date.now()` anywhere: the clock is an
 * argument, which is the same rule `fx/queue.ts` keeps and the reason a replay's
 * presentation is reproducible at all.
 *
 * The transition is **hand-authored rather than played**, the way the rest of the
 * fx suite authors transitions: `resolveEvents` reads a `before → after` diff, and
 * a hand-authored pair names exactly the change under test — a closure that fills
 * ground, converts a stack and takes the last seat's land — with nothing else
 * moving. The arrows are real tiling ids so the spatial staggering, and therefore
 * the overlay lifetimes these tests measure against, are the board's own.
 *
 * @see docs/spec/won-is-over/won-is-over.md — *When the celebration begins*
 */

import type { ArrowId, GameState, Group, Move, PlayerId, Rational, VertexId } from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { presentSteps } from '../src/fx/present';
import type { FxOverlay } from '../src/fx/present';
import { emptyQueue, enqueue, MAX_FX_ITEMS, queueSettleMs } from '../src/fx/queue';
import type { FxItem } from '../src/fx/queue';
import { MAJOR_SEQUENCE_MS } from '../src/fx/timing';

export const geometry = makeTiling();

export const A = 'A' as PlayerId;
export const C = 'C' as PlayerId;

/** The instant the deciding move commits. Any number; nothing derives it. */
export const T0 = 1_000_000;

/**
 * A **total** comparator on arrow ids — 0 for equal ids.
 *
 * `a < b ? -1 : 1` claims a strict order between two equal ids, which leaves
 * `toSorted` formally free to do anything with them. AGENTS.md names that shape as
 * one of the two realistic ways nondeterminism enters this repo; in a fixture
 * builder it costs a flaky test rather than a wrong game, which is exactly why it
 * would be expensive to diagnose.
 */
const byId = (left: ArrowId, right: ArrowId): number => {
  const a = String(left);
  const b = String(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const arrowsAround = (): readonly ArrowId[] =>
  [...new Set(geometry.window(geometry.seedPoint(), 2).arrows)].toSorted(byId);

const at = (index: number): ArrowId => {
  const arrow = arrowsAround()[index];
  if (arrow === undefined) throw new Error(`setup: the window has no arrow ${String(index)}`);
  return arrow;
};

interface Frame {
  readonly groups: readonly (readonly [ArrowId, PlayerId, number])[];
  readonly trails: readonly (readonly [PlayerId, readonly ArrowId[]])[];
  readonly territory: readonly (readonly [ArrowId, PlayerId])[];
  readonly winner?: PlayerId;
}

const frame = (spec: Frame): GameState => {
  const groups = new Map<ArrowId, Group>();
  for (const [arrow, owner, heads] of spec.groups) groups.set(arrow, { owner, heads, spent: 0 });
  const trails = new Map<PlayerId, ReadonlySet<ArrowId>>();
  for (const [player, arrows] of spec.trails) trails.set(player, new Set(arrows));
  return {
    players: [A, C],
    activePlayer: A,
    groups,
    trails,
    territory: new Map<ArrowId, PlayerId>(spec.territory),
    accumulators: new Map<ArrowId, Rational>(),
    spawners: new Map<VertexId, never>(),
    starvationStreaks: new Map(),
    dominationN: 5,
    winner: spec.winner,
  } satisfies GameState;
};

export interface DecidingMove {
  readonly before: GameState;
  /** The state the deciding move returned — `winner` set, ground and stack taken. */
  readonly after: GameState;
  readonly move: Move;
  /** The overlays the adapter queues for that move, in the order it queues them. */
  readonly overlays: readonly FxOverlay[];
  /** Those overlays queued at {@link T0} — the queue the frame after the win holds. */
  readonly queue: readonly FxItem[];
  /** How long from {@link T0} until the last of them has finished (ms). */
  readonly settleMs: number;
}

/**
 * A closure that fills ground, converts a stack, and wins — as a state transition
 * and the overlays that decorate it.
 *
 * All three effects on one move on purpose. The scenario is *"A wins on a closure
 * that fills ground and converts a stack"*, and a transition that only advanced a
 * head would queue one short routine overlay, which is exactly the case where
 * "paint the celebration immediately" and "wait for the move" are hard to tell
 * apart.
 */
export const aDecidingMove = (): DecidingMove => {
  const home = at(0);
  const tip = at(1);
  const filled = [at(2), at(3), at(4)] as const;
  const stack = at(5);
  const victimLand = at(6);
  const before = frame({
    groups: [
      [tip, A, 1],
      [stack, C, 2],
    ],
    trails: [[A, [tip, ...filled]]],
    territory: [
      [home, A],
      [victimLand, C],
    ],
  });
  const after = frame({
    groups: [
      [home, A, 1],
      [stack, A, 2],
    ],
    trails: [],
    territory: [
      [home, A],
      [tip, A],
      ...filled.map((arrow) => [arrow, A] as const),
      [stack, A],
      [victimLand, A],
    ],
    winner: A,
  });
  const move: Move = { kind: 'step', from: tip, exit: home, count: 1 };
  const overlays = presentSteps([{ before, after, move }], { geometry, seq: 0 });
  if (overlays.length === 0) throw new Error('setup: that transition presents no overlay');
  const queue = enqueue(emptyQueue(), overlays, T0);
  const settleMs = queueSettleMs(queue, T0);
  if (settleMs <= 0) throw new Error('setup: the deciding move’s overlays are already over');
  return { before, after, move, overlays, queue, settleMs };
};

/**
 * A deciding move whose overlays finish **inside** the ceiling.
 *
 * Needed to tell two implementations apart. `aDecidingMove` is the feature's own
 * Given — a closure that fills ground and converts a stack — and its overlays run
 * to {@link DecidingMove.settleMs}, which is *longer* than `MAJOR_SEQUENCE_MS`; on
 * that move "wait for the overlays" and "always wait the ceiling" give the same
 * answer, so neither test would notice an implementation that ignored the queue
 * entirely.
 *
 * This is the other side: A wins on a move that only advances a head and takes the
 * last seat's land — no fill, no conversion — so the overlays are over before the
 * ceiling and the queue is what decides.
 */
export const aQuietDecidingMove = (): DecidingMove => {
  const home = at(0);
  const tip = at(1);
  const victimLand = at(6);
  const before = frame({
    groups: [[tip, A, 1]],
    trails: [[A, [tip]]],
    territory: [
      [home, A],
      [victimLand, C],
    ],
  });
  const after = frame({
    groups: [[home, A, 1]],
    trails: [[A, [tip]]],
    territory: [[home, A]],
    winner: A,
  });
  const move: Move = { kind: 'step', from: tip, exit: home, count: 1 };
  const overlays = presentSteps([{ before, after, move }], { geometry, seq: 0 });
  const queue = enqueue(emptyQueue(), overlays, T0);
  const settleMs = queueSettleMs(queue, T0);
  if (settleMs <= 0) throw new Error('setup: that move’s overlays are already over');
  if (settleMs >= MAJOR_SEQUENCE_MS) {
    throw new Error(
      `setup: those overlays run ${String(settleMs)}ms, which is not inside the ${String(MAJOR_SEQUENCE_MS)}ms ceiling`,
    );
  }
  return { before, after, move, overlays, queue, settleMs };
};

/** An arrow the winner holds nothing on — what *dimmed but for A* is read off. */
export const strangerArrow = (): ArrowId => at(9);

/**
 * The same deciding move, with its overlays **dropped under queue pressure**.
 *
 * The queue caps at {@link MAX_FX_ITEMS} and sacrifices the least important first,
 * and among equals the oldest — so a burst of tier-1 effects arriving on the same
 * frame evicts the deciding move's own, which are the oldest tier-1 items present.
 * That is the case *"wait until the queue is empty"* cannot survive: the overlays
 * being waited for are gone, and the ones that displaced them are still running.
 *
 * Built out of the deciding move's own overlays repeated, rather than authored
 * shapes, so the flood's lifetimes are real ones and the queue is one the adapter
 * could actually hold.
 */
export interface DroppedOverlays {
  readonly deciding: DecidingMove;
  /** A queue with none of {@link DecidingMove.overlays} left in it. */
  readonly queue: readonly FxItem[];
  /** Ids of the deciding move's overlays, for asserting they are gone. */
  readonly droppedIds: readonly string[];
}

export const overlaysDroppedUnderPressure = (): DroppedOverlays => {
  const deciding = aDecidingMove();
  const major = deciding.overlays.filter((overlay) => overlay.tier === 1);
  if (major.length === 0) throw new Error('setup: that move queued no major overlay to drop');
  const flood: FxOverlay[] = [];
  while (flood.length <= MAX_FX_ITEMS) {
    for (const overlay of major) {
      flood.push({ ...overlay, id: `${overlay.id}#flood${String(flood.length)}` });
    }
  }
  const queue = enqueue(deciding.queue, flood, T0);
  const droppedIds = deciding.overlays.map((overlay) => overlay.id);
  const survivors = new Set(queue.map((item) => item.overlay.id));
  if (droppedIds.some((id) => survivors.has(id))) {
    throw new Error('setup: the pressure did not drop the deciding move’s overlays');
  }
  return { deciding, queue, droppedIds };
};

/** Live overlay ids in a queue, sorted — a readable "what is still on screen". */
export const idsIn = (queue: readonly FxItem[]): readonly string[] =>
  queue.map((item) => item.overlay.id).toSorted();
