/**
 * The board palette — dark ground, warm players, cool interface.
 *
 * The hues come from the first tiling render (`.scratch/tiling/board.svg`), which
 * alternated `#e0b050` gold against `#50a0e0` blue on a near-black navy. That reading
 * is kept for two reasons beyond taste: a dark ground lets **trail** sit at low alpha
 * and still be unmistakable against **territory** (§5 says that distinction is the
 * question a player asks most often), and it leaves the two brightest things on the
 * board — gold and cyan — free for *selection* and *reach* rather than spending them on
 * a player.
 */

import type { PlayerId } from '@arrows/contracts';

export interface PlayerStyle {
  /** Closed territory: solid (§7). */
  readonly fill: string;
  /** Open trail: same hue, thinned — cuttable, and visibly so (§5). */
  readonly trailFill: string;
  readonly stroke: string;
  /** Numerals drawn over `fill`, chosen so the count always reads. */
  readonly ink: string;
  readonly label: string;
}

const rgba = (r: number, g: number, b: number, a: number): string =>
  `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a)})`;

/**
 * Perceived lightness, so head counts stay legible on gold *and* on violet without
 * anyone hand-picking sixteen text colours.
 */
const luminance = (r: number, g: number, b: number): number =>
  (0.299 * r + 0.587 * g + 0.114 * b) / 255;

const entry = (label: string, r: number, g: number, b: number): PlayerStyle => ({
  fill: `rgb(${String(r)}, ${String(g)}, ${String(b)})`,
  trailFill: rgba(r, g, b, 0.32),
  stroke: rgba(Math.round(r * 0.45 + 30), Math.round(g * 0.45 + 30), Math.round(b * 0.45 + 30), 0.95),
  ink: luminance(r, g, b) > 0.58 ? '#141a21' : '#f4efe4',
  label,
});

const PALETTE: Record<string, PlayerStyle> = {
  A: entry('Player A', 224, 176, 80),
  B: entry('Player B', 80, 160, 224),
  C: entry('Player C', 232, 115, 74),
  D: entry('Player D', 127, 196, 127),
  E: entry('Player E', 185, 139, 217),
  F: entry('Player F', 224, 90, 122),
  G: entry('Player G', 79, 195, 176),
  H: entry('Player H', 201, 163, 122),
};

export const styleFor = (player: PlayerId): PlayerStyle => {
  const key = String(player);
  return PALETTE[key] ?? entry(key, 150, 158, 170);
};

/** The board itself. Neutral ground is a hair lighter than the void behind it. */
export const BOARD_BG = '#0e141b';
export const EMPTY_FILL = 'rgba(89, 110, 133, 0.16)';
export const EMPTY_STROKE = 'rgba(150, 176, 202, 0.22)';

/** Selection and reach. The two brightest things on the board, deliberately. */
export const HIGHLIGHT_STROKE = '#f0c96a';
export const MOVABLE_STROKE = 'rgba(240, 201, 106, 0.92)';
export const PREVIEW_STROKE = '#8fd6ff';
export const REACH_FILL = '#6cc0ff';
export const REACH_INK = 'rgba(214, 238, 255, 0.92)';
/** Reach that leaves a head stuck on a join/split (§5 branch toll). */
export const TOLL_REACH_FILL = '#e88a8a';
export const TOLL_PREVIEW_STROKE = '#f0a8a8';
/** The multi-hop route that will actually be applied — brighter than the reach wash. */
export const PATH_STROKE = '#b8e4ff';
export const PATH_WASH = 'rgba(184, 228, 255, 0.42)';
export const TOLL_PATH_STROKE = '#f0b4b4';
export const TOLL_PATH_WASH = 'rgba(232, 138, 138, 0.42)';

/**
 * A spawner's three arcs. Quieter than the players and quieter than reach, on purpose:
 * there are around a hundred of them on the board and the detail moved to hover.
 */
export const SPAWNER_TRACK = 'rgba(160, 188, 214, 0.34)';
/** Rim behind each arc so the gauge does not melt into tile fill. */
export const SPAWNER_TRACK_RIM = 'rgba(8, 12, 18, 0.92)';
export const SPAWNER_IDLE = 'rgba(160, 188, 214, 0.78)';
export const SPAWNER_HUB_IDLE = 'rgba(160, 188, 214, 0.55)';
export const SPAWNER_RIM = '#0b1016';
/** The ring drawn round the spawner under the cursor. */
export const SPAWNER_CURSOR = '#f0c96a';
/** Soft halo behind stack numerals — thin, not opaque. */
export const COUNT_HALO = 'rgba(8, 12, 18, 0.45)';
