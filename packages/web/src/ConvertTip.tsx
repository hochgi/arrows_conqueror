import type { ReactElement } from 'react';

export interface ConvertTipProps {
  readonly text: string;
  /** Cursor position within the stage, in pixels. */
  readonly x: number;
  readonly y: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
}

const TIP_W = 252;
const TIP_H = 64;

/**
 * Locked convert-refusal copy on hover of a refused grain exit (P28).
 *
 * Flip rather than clamp — same placement as `SpawnerTip`, so the tip does not
 * cover the tile it describes. Do not stack with the spawner tip.
 */
export const ConvertTip = ({
  text,
  x,
  y,
  stageWidth,
  stageHeight,
}: ConvertTipProps): ReactElement => {
  const left = x + 18 + TIP_W > stageWidth ? Math.max(4, x - 18 - TIP_W) : x + 18;
  const top = y + 12 + TIP_H > stageHeight ? Math.max(4, y - 12 - TIP_H) : y + 12;
  return (
    <div className="tip" style={{ left, top, width: TIP_W }} role="tooltip">
      <p className="tip-title">{text}</p>
    </div>
  );
};
