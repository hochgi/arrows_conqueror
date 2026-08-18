/**
 * The presentation event queue.
 *
 * Overlays live here between being resolved and being painted. Everything about it
 * is built around one rule:
 *
 *   **The game state always wins.**
 *
 * An overlay is additive decoration on top of a board that already renders `after`.
 * Dropping one, capping one, or interrupting one therefore cannot make the board
 * wrong — the worst case is an effect the player did not get to see, and the
 * position underneath is still exactly what the engine returned. That is why this
 * queue is allowed to be lossy under pressure, and why it never gates input.
 *
 * The clock enters here and nowhere deeper: `startedAt` is stamped once per item by
 * the adapter, and the rest is arithmetic. Given the same overlays and the same
 * stamp, the queue behaves identically — which keeps a replay's *presentation*
 * reproducible too, not just its state.
 */

import { overlayLifetimeMs, type FxOverlay } from './present';
import type { FxTier } from './timing';

/** One queued overlay, with the wall-clock instant its offsets count from. */
export interface FxItem {
  readonly overlay: FxOverlay;
  readonly startedAt: number;
}

/**
 * Ceiling on live overlays. Rapid play — a bot burst, an online batch landing all
 * at once — must not grow this without bound; past the cap the oldest routine
 * effects are dropped so the important ones still read.
 */
export const MAX_FX_ITEMS = 24;

export const emptyQueue = (): readonly FxItem[] => [];

/** Still on screen? */
const alive = (item: FxItem, now: number): boolean =>
  now - item.startedAt < overlayLifetimeMs(item.overlay);

export const pruneQueue = (queue: readonly FxItem[], now: number): readonly FxItem[] => {
  const kept = queue.filter((item) => alive(item, now));
  return kept.length === queue.length ? queue : kept;
};

/**
 * Which item to sacrifice first when over the cap: the least important, and among
 * equals the oldest. Tier 1 events survive a flood of routine steps, which is the
 * point of having tiers at all.
 */
const sacrificeOrder = (item: FxItem): readonly [FxTier, number] => [
  item.overlay.tier,
  item.startedAt,
];

const capQueue = (queue: readonly FxItem[]): readonly FxItem[] => {
  if (queue.length <= MAX_FX_ITEMS) return queue;
  const doomed = new Set(
    queue
      .map((item, index) => ({ item, index }))
      .toSorted((left, right) => {
        const [lt, ls] = sacrificeOrder(left.item);
        const [rt, rs] = sacrificeOrder(right.item);
        // Highest tier number (least important) first, then oldest, then insertion
        // order — no tie is ever broken on object identity.
        if (lt !== rt) return rt - lt;
        if (ls !== rs) return ls - rs;
        return left.index - right.index;
      })
      .slice(0, queue.length - MAX_FX_ITEMS)
      .map((entry) => entry.index),
  );
  return queue.filter((_item, index) => !doomed.has(index));
};

/**
 * Add overlays, dropping whatever has already finished and capping the rest.
 *
 * Returns the same array reference when nothing changes, so React can skip a
 * render on the common "nothing happened" path.
 */
export const enqueue = (
  queue: readonly FxItem[],
  overlays: readonly FxOverlay[],
  now: number,
): readonly FxItem[] => {
  const live = pruneQueue(queue, now);
  if (overlays.length === 0) return live;
  const added = overlays.map((overlay) => ({ overlay, startedAt: now }));
  return capQueue([...live, ...added]);
};

/** Longest remaining lifetime in the queue — how long until a prune is worth it. */
export const queueSettleMs = (queue: readonly FxItem[], now: number): number => {
  let longest = 0;
  for (const item of queue) {
    longest = Math.max(longest, overlayLifetimeMs(item.overlay) - (now - item.startedAt));
  }
  return Math.max(0, longest);
};

/** Every live overlay of one kind, oldest first. The board's read path. */
export const overlaysOfKind = <K extends FxOverlay['kind']>(
  queue: readonly FxItem[],
  kind: K,
): readonly Extract<FxOverlay, { kind: K }>[] => {
  const out: Extract<FxOverlay, { kind: K }>[] = [];
  for (const item of queue) {
    if (item.overlay.kind === kind) out.push(item.overlay as Extract<FxOverlay, { kind: K }>);
  }
  return out;
};

/** Arrows carrying a live overlay of the given kind — the "fresh" style lookups. */
export const arrowsWithKind = (
  queue: readonly FxItem[],
  kind: FxOverlay['kind'],
): ReadonlyMap<string, FxOverlay> => {
  const out = new Map<string, FxOverlay>();
  for (const item of queue) {
    const { overlay } = item;
    if (overlay.kind !== kind) continue;
    if ('cells' in overlay) {
      for (const cell of overlay.cells) out.set(String(cell.arrow), overlay);
    } else if ('arrow' in overlay) {
      out.set(String(overlay.arrow), overlay);
    }
  }
  return out;
};

/** True while any tier-1 effect is still playing — used to say "resolving". */
export const isResolving = (queue: readonly FxItem[], now: number): boolean =>
  queue.some((item) => item.overlay.tier === 1 && alive(item, now));
