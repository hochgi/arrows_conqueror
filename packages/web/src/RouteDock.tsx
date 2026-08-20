import type { ReactElement } from 'react';
import type { CountControl } from './route';

/**
 * The docked count control for a drafted route (P35).
 *
 * It replaces P34's tip-anchored panel, and the whole change is *where it lives*:
 * a strip **under** the board — its own row of the app's grid, a sibling of the
 * board's container rather than a child of it, so it takes its own space instead
 * of covering the board's. The old panel hid 4 of the 12 clickable arrows at a
 * wide width, and on a 375 px screen anything anchored on the tip covers part of
 * the very offer it is asking about. Moving the rectangle would move that
 * problem; going under the board retires it.
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
 * **The strip is always mounted; only its content comes and goes.** `control` is
 * `undefined` whenever there is nothing to ask — an empty draft, a locked seat, a
 * finished match — and then the strip paints nothing and holds no focusable
 * widget, but its row keeps its height. That matters more than it sounds: if the
 * row appeared with the first click of every route, the board would shrink by the
 * strip's height at the exact moment the player is aiming at it, and every arrow
 * would slide under their finger mid-gesture. The row is reserved by the strip's
 * own fixed grid rows, so the reserved height and the live height are the same
 * height by construction rather than by a hard-coded guess.
 */
export interface RouteDockProps {
  /** The question, or `undefined` when there is none to ask. */
  readonly control?: CountControl | undefined;
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

/** The sentry §5 chooses: the heads the run does not take with it. */
const sentryNote = (heads: number): string =>
  heads === 0 ? 'no sentry' : `${String(heads)} stay${heads === 1 ? 's' : ''}`;

export const RouteDock = ({
  control,
  onCount,
  onSend,
  onCancel,
}: RouteDockProps): ReactElement => {
  if (control === undefined) {
    // Mounted, silent, and exactly as tall as it will be once there is something
    // to ask — see the note above on why the height cannot come and go.
    return <div className="route-dock route-dock-idle" aria-hidden="true" />;
  }
  const { count, ceiling, counts, draftLength } = control;
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
      <p className="route-dock-note">{sentryNote(sentry)}</p>
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
