import type { ReactElement } from 'react';

/**
 * The docked count control for a drafted route (P35).
 *
 * It replaces P34's `RouteTip`, and the whole change is *where it lives*: a fixed
 * strip **below** the board — a sibling of `.stage` inside `.app`, never a child
 * of the stage. A panel anchored on the tip covered 4 of the 12 clickable arrows
 * at desktop width, and on a 375 px viewport anything anchored at the tip covers
 * part of the offer it is asking about. Relocating the rectangle would move that
 * problem; leaving the board retires it.
 *
 * Hence the props carry **no coordinates**. There is nothing here to position
 * from, which is the invariant rather than a convenience: the spatial link is
 * carried by the tip's halo (P31), not by the control touching it.
 *
 * It asks the one question a named run has left — how many heads walk it, the
 * rest staying where the run began as a sentry (§5) — and the two ways out. It is
 * absent with an empty draft: there is no run to count until a click names one.
 */
export interface RouteDockProps {
  /** The count on the last drafted run. */
  readonly count: number;
  /** Heads standing where the run began — the sentry is the difference. */
  readonly ceiling: number;
  /** Legal counts for that run, ascending. */
  readonly counts: readonly number[];
  readonly draftLength: number;
  readonly onCount: (count: number) => void;
  readonly onSend: () => void;
  readonly onCancel: () => void;
}

export const RouteDock = (_props: RouteDockProps): ReactElement => {
  throw new Error('P35: RouteDock is not implemented');
};
