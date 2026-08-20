/**
 * docs/spec/win-board-celebration/win-board-celebration.edge-cases.feature
 * One it() per Gherkin scenario. Pure helper only — no RTL, no jsdom.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MATCH_OVER_OVERLAY,
  hasSplash,
  isMatchOverDimmed,
  playHighlightsAllowed,
  victoryFx,
} from '../src/fx/victory';
import {
  bannerOf,
  blockadedBoard,
  eliminationBoard,
  geometry,
  leftoverClockBoard,
  noShareBoard,
  playingBoard,
  pulseOf,
  reversedShareBoards,
  shineOf,
  sortedIds,
  starvationBoard,
  trailBoard,
} from './victory-fx.support';

const helperSrc = (): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/fx/victory.ts'), 'utf8');

describe('Win board celebration — degenerate over, in-play leak, purity', () => {
  it('Elimination winner with no shares', () => {
    const { state, g1 } = noShareBoard();
    const fx = victoryFx(state, geometry);
    expect(shineOf(fx).size).toBe(0);
    expect(pulseOf(fx).has(g1)).toBe(true);
    // P36: the caption names the winner, not the mechanism.
    expect(bannerOf(fx)).toBe('Player A wins');
  });

  it('Blockaded winner share still shines', () => {
    const { state, s1 } = blockadedBoard();
    expect(state.territory.get(s1)).toBeDefined();
    expect(state.groups.get(s1)?.owner).not.toBe(state.territory.get(s1));
    expect(shineOf(victoryFx(state, geometry)).has(s1)).toBe(true);
  });

  it('Winner open trail is not dimmed', () => {
    const { state, u1 } = trailBoard();
    const fx = victoryFx(state, geometry);
    expect(fx.kind).toBe('over');
    expect(isMatchOverDimmed(fx, u1, state)).toBe(false);
    expect(shineOf(fx).has(u1)).toBe(false);
  });

  it('Leftover starvation clock does not caption the win', () => {
    const { state, b } = leftoverClockBoard();
    expect(state.starvationStreaks.get(b)).toBeGreaterThanOrEqual(state.dominationN);
    const fx = victoryFx(state, geometry);
    expect(bannerOf(fx)).toBe('Player A wins');
  });

  it('Unset winner never dims', () => {
    const { state } = playingBoard();
    const fx = victoryFx(state, geometry);
    expect(fx.kind).toBe('playing');
    const sample = geometry.window(geometry.seedPoint(), 3).arrows;
    expect(sample.length).toBeGreaterThan(0);
    for (const arrow of sample) {
      expect(isMatchOverDimmed(fx, arrow, state)).toBe(false);
    }
    expect(pulseOf(fx).size).toBe(0);
  });

  it('Play highlights vanish only when over', () => {
    const { state, gA } = starvationBoard();
    const fx = victoryFx(state, geometry);
    expect(playHighlightsAllowed(fx)).toBe(false);
    expect(pulseOf(fx).has(gA)).toBe(true);
    expect(playHighlightsAllowed(victoryFx(playingBoard().state, geometry))).toBe(true);
  });

  it('Equal states list the same shine set', () => {
    const { left, right, s1, s2 } = reversedShareBoards();
    const shineL = sortedIds(shineOf(victoryFx(left, geometry)));
    const shineR = sortedIds(shineOf(victoryFx(right, geometry)));
    expect(shineL).toEqual(shineR);
    expect(shineL).toEqual([String(s1), String(s2)].toSorted());
  });

  it('Online finished boards use the same helper', () => {
    // GET /games/:id hydrates the same GameState. Board and Hud call
    // victoryFx(state, geometry) only — no extra adapter field.
    const { state } = eliminationBoard();
    const hydrated = { ...state };
    const fxHot = victoryFx(state, geometry);
    const fxGet = victoryFx(hydrated, geometry);
    expect(victoryFx.length).toBe(2);
    expect(fxGet).toEqual(fxHot);
    expect(fxGet.kind).toBe('over');
    if (fxGet.kind === 'over') {
      expect(fxGet.winner).toBe(state.winner);
    }
  });

  it('No splash surface exists', () => {
    const { state } = eliminationBoard();
    const fx = victoryFx(state, geometry);
    expect(MATCH_OVER_OVERLAY).toBeUndefined();
    expect(hasSplash(fx)).toBe(false);
    expect(helperSrc()).not.toContain('portion-backdrop');
    const boardSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/Board.tsx'),
      'utf8',
    );
    const hudSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/Hud.tsx'),
      'utf8',
    );
    expect(boardSrc).not.toContain('portion-backdrop');
    expect(hudSrc).not.toContain('portion-backdrop');
    expect(boardSrc).not.toMatch(/\bsplash\b/i);
    expect(hudSrc).not.toMatch(/\bsplash\b/i);
  });

  it('Rules-core victory is not reimplemented', async () => {
    const exported = Object.keys(await import('../src/fx/victory'));
    expect(exported).not.toContain('resolveLosses');
    expect(exported).not.toContain('tickStarvation');
    const src = helperSrc();
    expect(src).not.toContain('@conquarrow/rules-core');
    expect(src).not.toContain('resolveLosses');
    expect(src).not.toContain('tickStarvation');
  });
});
