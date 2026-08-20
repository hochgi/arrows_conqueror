/**
 * docs/spec/win-board-celebration/win-board-celebration.core.feature
 * One it() per Gherkin scenario. Pure helper only — no RTL, no jsdom.
 */

import { describe, expect, it } from 'vitest';
import { styleFor } from '../src/colors';
import { yieldSoonByArrow } from '../src/spawnerInfo';
import {
  MATCH_OVER_HINT,
  controlsLocked,
  isMatchOverDimmed,
  victoryFx,
  yieldSoonAllowed,
} from '../src/fx/victory';
import {
  bannerOf,
  dimBoard,
  eliminationBoard,
  geometry,
  hintOf,
  playingBoard,
  pulseOf,
  shineBoard,
  shineOf,
  starvationBoard,
  yieldSoonBoard,
} from './victory-fx.support';

describe('Win board celebration — banner, shine, pulse, quiet board', () => {
  // P36 repeals both mechanism-naming scenarios in this Rule. Locked banner:
  // `{label} wins` — see docs/spec/losing-conditions/losing-conditions.md.
  it('Elimination names the winner, not a mechanism', () => {
    const { state } = eliminationBoard();
    const fx = victoryFx(state, geometry);
    expect('how' in fx).toBe(false);
    expect(bannerOf(fx)).toBe('Player A wins');
  });

  it('A win with the victim still on the board names no mechanism either', () => {
    // This board is now unreachable from the engine — P36 removes the loser's
    // heads — but it is exactly the state the repealed `how` derivation keyed
    // off, so it is worth pinning that the banner does not branch on it.
    const { state, b, gB } = starvationBoard();
    expect(state.groups.get(gB)?.owner).toBe(b);
    expect(state.groups.get(gB)?.heads).toBeGreaterThan(0);
    const fx = victoryFx(state, geometry);
    expect('how' in fx).toBe(false);
    expect(bannerOf(fx)).toBe('Player A wins');
  });

  it('In play the turn banner is unchanged', () => {
    const { state, a } = playingBoard();
    const fx = victoryFx(state, geometry);
    expect(fx.kind).toBe('playing');
    expect('banner' in fx).toBe(false);
    expect(controlsLocked(fx)).toBe(false);
    expect(state.winner).toBeUndefined();
    expect(styleFor(state.activePlayer).label).toBe(styleFor(a).label);
    expect(styleFor(a).label).toBe('Player A');
  });

  it('Winner shares shine; non-share territory does not', () => {
    const { state, s1, s2, t1 } = shineBoard();
    const shine = shineOf(victoryFx(state, geometry));
    expect(shine.has(s1)).toBe(true);
    expect(shine.has(s2)).toBe(true);
    expect(shine.has(t1)).toBe(false);
  });

  it('Winner stacks pulse; loser stacks do not', () => {
    const { state, gA, gB } = starvationBoard();
    const pulse = pulseOf(victoryFx(state, geometry));
    expect(pulse.has(gA)).toBe(true);
    expect(pulse.has(gB)).toBe(false);
  });

  it('Yield-soon is suppressed when over', () => {
    const { state, a, s1 } = yieldSoonBoard(true);
    expect(yieldSoonByArrow(geometry, { ...state, winner: undefined }).get(s1)).toBe(1);
    const fx = victoryFx(state, geometry);
    expect(yieldSoonAllowed(fx)).toBe(false);
    expect(state.territory.get(s1)).toBe(a);
    expect(shineOf(fx).has(s1)).toBe(true);
  });

  it('Yield-soon still works in play', () => {
    const { state, s1 } = yieldSoonBoard(false);
    expect(state.winner).toBeUndefined();
    const fx = victoryFx(state, geometry);
    expect(yieldSoonAllowed(fx)).toBe(true);
    expect(yieldSoonByArrow(geometry, state).get(s1)).toBe(1);
    expect(shineOf(fx).size).toBe(0);
  });

  it('Non-winner arrows dim; winner territory does not', () => {
    const { state, x, y, z } = dimBoard();
    const fx = victoryFx(state, geometry);
    expect(isMatchOverDimmed(fx, x, state)).toBe(true);
    expect(isMatchOverDimmed(fx, y, state)).toBe(true);
    expect(isMatchOverDimmed(fx, z, state)).toBe(false);
  });

  it('Match-over hint and controls', () => {
    const { state } = eliminationBoard();
    const fx = victoryFx(state, geometry);
    expect(hintOf(fx)).toBe(MATCH_OVER_HINT);
    expect(MATCH_OVER_HINT).toBe('Match over — pan to look around');
    expect(controlsLocked(fx)).toBe(true);
  });
});
