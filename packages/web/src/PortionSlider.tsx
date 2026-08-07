import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export interface PortionSliderProps {
  /** Portions that actually arrive, ascending. The slider offers only these. */
  readonly allowed: readonly number[];
  /** How many steps the trip takes — why the floor is not 1. */
  readonly steps: number;
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
 */
export const PortionSlider = ({
  allowed,
  steps,
  onConfirm,
  onCancel,
  onPreview,
}: PortionSliderProps): ReactElement => {
  const options = useMemo(() => (allowed.length > 0 ? allowed : [1]), [allowed]);
  const [index, setIndex] = useState(options.length - 1);

  useEffect(() => {
    setIndex(options.length - 1);
  }, [options]);

  const value = options[Math.min(index, options.length - 1)] ?? 1;
  const min = options[0] ?? 1;
  const max = options[options.length - 1] ?? 1;

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

  return (
    <div
      className="portion-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="portion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Send heads"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <p className="portion-title">
          Send heads · {steps} {steps === 1 ? 'step' : 'steps'}
        </p>
        <p className="portion-value">{value}</p>
        {min > 1 ? (
          <p className="portion-note">
            {min} needed to travel {steps} steps
          </p>
        ) : (
          <p className="portion-note">any portion reaches</p>
        )}
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
