/**
 * Player palette — trail uses the same hue at 50% opacity (§5 / P11 D4).
 */

import type { PlayerId } from '@arrows/contracts';

export interface PlayerStyle {
  readonly fill: string;
  readonly trailFill: string;
  readonly stroke: string;
  readonly label: string;
}

const PALETTE: Record<string, PlayerStyle> = {
  A: {
    fill: '#1a7a6d',
    trailFill: 'rgba(26, 122, 109, 0.5)',
    stroke: '#0d4a42',
    label: 'Player A',
  },
  B: {
    fill: '#b84a2e',
    trailFill: 'rgba(184, 74, 46, 0.5)',
    stroke: '#7a2e1a',
    label: 'Player B',
  },
};

export const styleFor = (player: PlayerId): PlayerStyle => {
  const key = String(player);
  return (
    PALETTE[key] ?? {
      fill: '#4a5568',
      trailFill: 'rgba(74, 85, 104, 0.5)',
      stroke: '#2d3748',
      label: key,
    }
  );
};

export const EMPTY_FILL = 'rgba(232, 226, 214, 0.35)';
export const EMPTY_STROKE = 'rgba(90, 78, 60, 0.35)';
export const HIGHLIGHT_STROKE = '#c9a227';
export const PREVIEW_STROKE = '#3b82c4';
export const BOARD_BG = '#e8e2d6';
