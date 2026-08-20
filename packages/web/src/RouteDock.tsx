import type { ReactElement } from 'react';

/**
 * The docked count control for a drafted route (P35).
 *
 * It replaces P34's tip-anchored panel, and the whole change is *where it lives*:
 * a strip **below** the board — its own row of the app's grid, a sibling of the
 * board's container rather than a child of it, so it takes its space instead of
 * covering the board's. The old panel covered 4 of the 12 clickable arrows
 * at a wide viewing size, and on a 375 px board anything anchored on the tip
 * hides part of the very offer it is asking about. Moving the rectangle would
 * move that problem; going under the board retires it.
 *
 * Hence the props carry **no coordinates** — there is nothing here to be
 * positioned from, and that is an invariant rather than a convenience. The
 * spatial link is carried by the tip's halo (P31), not by the control touching
 * the arrow.
 *
 * It asks the one question a named run has: how many heads walk it, the rest
 * staying where the run began as a sentry (§5). Changing the count repaints the
 * rays live, which is how a player learns that distance is bought with heads
 * (§3); no numeral says how far, because the ray's painted length is the display
 * and nothing should be able to disagree with it.
 *
 * Absent with an empty draft — there is no run to count until a click names one.
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

/**
 * The next offerable count below / above the current one, if there is one.
 *
 * The stepper walks the *offered* list rather than `count ± 1`: the counts that
 * walk a run are not contiguous from 1 — a three step run floors at four — so
 * arithmetic on the number would step onto a count the engine refuses.
 */
const neighbour = (
  counts: readonly number[],
  count: number,
  direction: -1 | 1,
): number | undefined => {
  const under = counts.filter((c) => c < count);
  const over = counts.filter((c) => c > count);
  return direction === -1 ? under[under.length - 1] : over[0];
};

export const RouteDock = ({
  count,
  ceiling,
  counts,
  draftLength,
  onCount,
  onSend,
  onCancel,
}: RouteDockProps): ReactElement => {
  const fewer = neighbour(counts, count, -1);
  const more = neighbour(counts, count, 1);
  const sentry = Math.max(0, ceiling - count);
  return (
    <div className="route-dock">
      <div className="route-dock-count">
        <button
          type="button"
          aria-label="Carry fewer heads"
          disabled={fewer === undefined}
          onClick={() => {
            if (fewer !== undefined) onCount(fewer);
          }}
        >
          −
        </button>
        <span className="route-dock-heads">
          {count}
          <small>/{ceiling}</small>
        </span>
        <button
          type="button"
          aria-label="Carry more heads"
          disabled={more === undefined}
          onClick={() => {
            if (more !== undefined) onCount(more);
          }}
        >
          +
        </button>
      </div>
      {/* The sentry §5 chooses — the other half of the count decision. */}
      <p className="route-dock-note">
        {sentry === 0 ? 'no sentry' : `${String(sentry)} stay${sentry === 1 ? 's' : ''}`}
      </p>
      <div className="route-dock-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={draftLength === 0} onClick={onSend}>
          Send
        </button>
      </div>
    </div>
  );
};
