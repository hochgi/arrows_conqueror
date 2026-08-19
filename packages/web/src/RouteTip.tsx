import type { ReactElement } from 'react';

/**
 * The inline control at the tip of a drafted route (P34).
 *
 * Anchored *on the tip*, not in a modal: the board is what is being drawn on, so a
 * backdrop over it is the wrong shape. It carries the one forward decision a run
 * has left — how many heads travel from here, the rest staying as a sentry (§5) —
 * and the two ways out, Send and Cancel.
 *
 * Changing the carry repaints the rays live, which is how the player learns that
 * distance is bought with heads (§3). No numeral says how many steps are left: the
 * ray's painted length is the display, so nothing can disagree with it.
 */
export interface RouteTipProps {
  /** Screen position of the tip arrow, in stage pixels. */
  readonly x: number;
  readonly y: number;
  readonly carry: number;
  /** Heads standing on the tip — the sentry is the difference. */
  readonly tipHeads: number;
  /** Carries that can actually make a hop from here, ascending. */
  readonly carries: readonly number[];
  readonly draftLength: number;
  readonly onCarry: (count: number) => void;
  readonly onSend: () => void;
  readonly onCancel: () => void;
}

/** The next offerable carry below / above the current one, if there is one. */
const step = (
  carries: readonly number[],
  carry: number,
  direction: -1 | 1,
): number | undefined => {
  const below = carries.filter((count) => count < carry);
  const above = carries.filter((count) => count > carry);
  return direction === -1 ? below[below.length - 1] : above[0];
};

export const RouteTip = ({
  x,
  y,
  carry,
  tipHeads,
  carries,
  draftLength,
  onCarry,
  onSend,
  onCancel,
}: RouteTipProps): ReactElement => {
  const lower = step(carries, carry, -1);
  const raise = step(carries, carry, 1);
  const sentry = Math.max(0, tipHeads - carry);
  return (
    <div className="route-tip" style={{ left: x, top: y }}>
      <div className="route-tip-carry">
        <button
          type="button"
          aria-label="Carry fewer heads"
          disabled={lower === undefined}
          onClick={() => {
            if (lower !== undefined) onCarry(lower);
          }}
        >
          −
        </button>
        <span className="route-tip-count">
          {carry}
          <small>/{tipHeads}</small>
        </span>
        <button
          type="button"
          aria-label="Carry more heads"
          disabled={raise === undefined}
          onClick={() => {
            if (raise !== undefined) onCarry(raise);
          }}
        >
          +
        </button>
      </div>
      <p className="route-tip-note">
        {sentry === 0 ? 'no sentry' : `${String(sentry)} stay${sentry === 1 ? 's' : ''}`}
      </p>
      <div className="route-tip-actions">
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
