import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

export interface PortionSliderProps {
  readonly max: number;
  readonly onConfirm: (count: number) => void;
  readonly onCancel: () => void;
}

/** Modal slider: pick how many heads to send (1..max). */
export const PortionSlider = ({ max, onConfirm, onCancel }: PortionSliderProps): ReactElement => {
  const [value, setValue] = useState(max);

  useEffect(() => {
    setValue(max);
  }, [max]);

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
        <p className="portion-title">Send heads</p>
        <p className="portion-value">{value}</p>
        <input
          className="portion-range"
          type="range"
          min={1}
          max={max}
          step={1}
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
          }}
        />
        <div className="portion-scale">
          <span>1</span>
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
