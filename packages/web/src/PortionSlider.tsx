import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { portionDialogKind } from './selectionChrome';

export interface PortionSliderProps {
  /** Portions that actually arrive, ascending. The slider offers only these. */
  readonly allowed: readonly number[];
  /** How many steps the trip takes — why the floor is not 1. */
  readonly steps: number;
  /** Heads on the source arrow, so the dialog can name what stays behind. */
  readonly heads: number;
  readonly onConfirm: (count: number) => void;
  readonly onCancel: () => void;
  /** Live path preview as the slider moves. */
  readonly onPreview?: (count: number) => void;
}

/**
 * Modal slider: how many heads to send.
 *
 * Runs over an **index into `allowed`** rather than a numeric range, because the floor
 * is the fewest heads that can make the trip (§3 buys distance with heads) and a merge
 * that would be barred can leave a gap in the middle. Offering a portion that cannot
 * arrive is the fastest way to make a correct rule look broken.
 *
 * **Mobile:** the tap that opens this dialog also synthesises a follow-up mouse/pointer
 * event on the new backdrop. A short open-grace ignores that ghost dismiss so the
 * slider does not vanish on the same finger-up that summoned it.
 */
export const PortionSlider = ({
  allowed,
  steps,
  heads,
  onConfirm,
  onCancel,
  onPreview,
}: PortionSliderProps): ReactElement => {
  const options = useMemo(() => (allowed.length > 0 ? allowed : [1]), [allowed]);
  const [index, setIndex] = useState(options.length - 1);
  const dismissable = useRef(false);

  useEffect(() => {
    setIndex(options.length - 1);
  }, [options]);

  useEffect(() => {
    dismissable.current = false;
    const handle = window.setTimeout(() => {
      dismissable.current = true;
    }, 400);
    return () => {
      window.clearTimeout(handle);
    };
  }, []);

  const value = options[Math.min(index, options.length - 1)] ?? 1;
  const min = options[0] ?? 1;
  const max = options[options.length - 1] ?? 1;
  const confirmOnly = portionDialogKind(allowed) === 'confirm';

  useEffect(() => {
    onPreview?.(value);
  }, [value, onPreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm(value);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel, onConfirm, value]);

  const dismissIfBackdrop = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return;
    // Eat the ghost tap either way so it cannot fall through to the board.
    e.preventDefault();
    e.stopPropagation();
    if (!dismissable.current) return;
    onCancel();
  };

  return (
    <div
      className="portion-backdrop"
      role="presentation"
      onPointerDown={dismissIfBackdrop}
      onMouseDown={(e) => {
        // Compat mouse events after touch — same ghost-dismiss path on some WebViews.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        if (!dismissable.current) return;
        onCancel();
      }}
    >
      <div
        className="portion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Send heads"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <p className="portion-title">
          Send heads · {steps} {steps === 1 ? 'step' : 'steps'}
        </p>
        <p className="portion-value">{value}</p>
        {/* Event 10: a player should know the *shape* of the outcome before
            committing, not just the number sent. A split leaves a sentry behind
            and that is a decision, so the dialog says so in the same breath. */}
        <p className="portion-split">
          {heads - value > 0 ? (
            <>
              <strong>{value}</strong> go · <strong>{heads - value}</strong>{' '}
              {heads - value === 1 ? 'stays' : 'stay'} behind
            </>
          ) : (
            <>the whole stack goes · nothing stays behind</>
          )}
        </p>
        {min > 1 ? (
          <p className="portion-note">
            {min} needed to travel {steps} steps
          </p>
        ) : (
          <p className="portion-note">any portion reaches</p>
        )}
        {confirmOnly ? null : (
          <>
            <input
              className="portion-range"
              type="range"
              min={0}
              max={options.length - 1}
              step={1}
              value={Math.min(index, options.length - 1)}
              aria-label="Heads to send"
              onChange={(e) => {
                setIndex(Number(e.target.value));
              }}
            />
            <div className="portion-scale">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </>
        )}
        <div className="portion-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onConfirm(value);
            }}
          >
            Send {value}
          </button>
        </div>
      </div>
    </div>
  );
};
