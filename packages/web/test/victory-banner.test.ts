/**
 * The victory banner must stop naming a mechanism (P36).
 *
 * `fx/victory.ts` derives *how* a match was won from a head count —
 * `livingCount(state) === 1 ? 'elimination' : 'starvation'` — and that works
 * **only** because starvation used to set `winner` while the victim still held
 * heads. P36 removes a lost seat's heads, so whenever `winner` is set exactly
 * one seat has heads: `how` is always `'elimination'`, the `'starvation'` branch
 * is dead, and the banner reads "… wins — last head" even when the loser
 * starved. That is a lie this packet introduces, which is why fixing it is in
 * scope when adapter presentation generally is not.
 *
 * The requirement is negative on purpose: **while `winner` is set, the banner
 * shall not assert a losing mechanism.** The reason is genuinely not derivable
 * after the fact — the losing seat and its clock are both gone — so deriving it
 * would mean storing it, and recording *why* a seat was lost is an explicit
 * follow-on. These tests therefore pin the constraint and the winner's name,
 * **not** a caption wording: the spec says "names the winner and nothing else"
 * without giving a literal, and picking one is phase 3's to make.
 *
 * @see docs/spec/losing-conditions/losing-conditions.md — *The victory banner
 * must stop naming a mechanism*
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerId } from '@conquarrow/contracts';
import { styleFor } from '../src/colors';
import { victoryFx } from '../src/fx/victory';
import {
  bannerOf,
  blockadedBoard,
  eliminationBoard,
  geometry,
  leftoverClockBoard,
  livingCount,
  noShareBoard,
  playingBoard,
  starvationBoard,
} from './victory-fx.support';

const helperSrc = (): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/fx/victory.ts'), 'utf8');

/** Every word the banner is no longer allowed to claim. */
const MECHANISMS = ['last head', 'elimination', 'starvation', 'starved', 'domination'];

/** Every authored over-board this suite has, with the seat that won it. */
const overBoards = (): readonly { readonly label: string; readonly state: GameState }[] => [
  { label: 'elimination', state: eliminationBoard().state },
  { label: 'starvation (pre-P36 shape)', state: starvationBoard().state },
  { label: 'no shares', state: noShareBoard().state },
  { label: 'blockaded share', state: blockadedBoard().state },
  { label: 'leftover clock', state: leftoverClockBoard().state },
];

const winnerOf = (state: GameState): PlayerId => {
  const winner = state.winner;
  if (winner === undefined) throw new Error('setup: that board has no winner');
  return winner;
};

describe('the victory banner names the winner and nothing else', () => {
  it('While state.winner is set, the banner shall not assert a losing mechanism', () => {
    for (const { label, state } of overBoards()) {
      const banner = bannerOf(victoryFx(state, geometry));
      expect(banner, label).toBeDefined();
      for (const mechanism of MECHANISMS) {
        expect(String(banner).toLowerCase(), `${label} / ${mechanism}`).not.toContain(mechanism);
      }
    }
  });

  it('While state.winner is set, the banner shall name the winning seat', () => {
    for (const { label, state } of overBoards()) {
      const banner = bannerOf(victoryFx(state, geometry));
      expect(String(banner), label).toContain(styleFor(winnerOf(state)).label);
    }
  });

  it('The banner shall not distinguish two wins that differ only in how the loser went', () => {
    // Under P36 both of these are one-seat-with-heads boards, so nothing in the
    // state can tell a starvation win from an elimination win. Same winner, same
    // caption — that is the whole point of dropping the clause.
    const elimination = eliminationBoard();
    const starved: GameState = {
      // A starvation win *after* P36 removes the victim: winner set, victim gone.
      ...elimination.state,
      starvationStreaks: new Map([[elimination.b, elimination.state.dominationN]]),
    };
    expect(livingCount(elimination.state)).toBe(1);
    expect(livingCount(starved)).toBe(1);

    const banner = bannerOf(victoryFx(starved, geometry));
    expect(banner).toBe(bannerOf(victoryFx(elimination.state, geometry)));
    // Identical is necessary but not sufficient: today they are identical
    // *because* both wrongly read "last head".
    for (const mechanism of MECHANISMS) {
      expect(String(banner).toLowerCase()).not.toContain(mechanism);
    }
  });

  it('The banner shall not read starvationStreaks', () => {
    const { state, a } = leftoverClockBoard();
    const cleared: GameState = { ...state, starvationStreaks: new Map() };
    expect(state.starvationStreaks.size).toBeGreaterThan(0);

    expect(bannerOf(victoryFx(cleared, geometry))).toBe(bannerOf(victoryFx(state, geometry)));
    expect(String(bannerOf(victoryFx(state, geometry)))).toContain(styleFor(a).label);
  });

  it('The fx shall carry no mechanism verdict, and shall not derive one', () => {
    // A field that captions a mechanism the state cannot supply is worse than a
    // wrong string: it looks authoritative. `livingCount` exists only to feed it.
    const fx = victoryFx(eliminationBoard().state, geometry);
    expect(fx.kind).toBe('over');
    expect('how' in fx).toBe(false);

    const src = helperSrc();
    expect(src).not.toContain("'elimination'");
    expect(src).not.toContain("'starvation'");
    expect(src).not.toContain('last head');
  });

  it('While state.winner is unset, there is still no banner at all', () => {
    const fx = victoryFx(playingBoard().state, geometry);
    expect(fx.kind).toBe('playing');
    expect(bannerOf(fx)).toBeUndefined();
  });
});
