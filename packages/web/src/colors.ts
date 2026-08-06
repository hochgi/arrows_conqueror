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

const rgba = (r: number, g: number, b: number, a: number): string =>
  `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a)})`;

const entry = (
  label: string,
  r: number,
  g: number,
  b: number,
): PlayerStyle => ({
  fill: `rgb(${String(r)}, ${String(g)}, ${String(b)})`,
  trailFill: rgba(r, g, b, 0.5),
  stroke: `rgb(${String(Math.round(r * 0.55))}, ${String(Math.round(g * 0.55))}, ${String(Math.round(b * 0.55))})`,
  label,
});

const PALETTE: Record<string, PlayerStyle> = {
  A: entry('Player A', 26, 122, 109),
  B: entry('Player B', 184, 74, 46),
  C: entry('Player C', 42, 111, 151),
  D: entry('Player D', 154, 91, 19),
  E: entry('Player E', 92, 107, 47),
  F: entry('Player F', 139, 58, 74),
  G: entry('Player G', 61, 90, 128),
  H: entry('Player H', 109, 76, 65),
};

export const styleFor = (player: PlayerId): PlayerStyle => {
  const key = String(player);
  return PALETTE[key] ?? entry(key, 74, 85, 104);
};

export const EMPTY_FILL = 'rgba(232, 226, 214, 0.35)';
export const EMPTY_STROKE = 'rgba(90, 78, 60, 0.35)';
export const HIGHLIGHT_STROKE = '#c9a227';
export const PREVIEW_STROKE = '#3b82c4';
export const TARGET_FILL = 'rgba(59, 130, 196, 0.45)';
export const MOVABLE_STROKE = '#c9a227';
export const BOARD_BG = '#e8e2d6';
