/**
 * EARS invariants for docs/spec/ai-move-playback/ai-move-playback.md.
 *
 * Table-driven / small explicit cases in Vitest — this repo has no fast-check
 * (same style as packages/web/test/victory-fx.invariants.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { applyMovesSequentially, localAiChairKey } from '../src/botPlayback';
import {
  activeId,
  botPlaybackSource,
  isAiSeatOf,
  localAiOpts,
  occupancyShifted,
  openingState,
  playbackOpts,
  plannedMoves,
  recorder,
  stubRules,
  withWinner,
} from './botPlayback.support';

describe('ai-move-playback invariants', () => {
  it('When playback is given n greater than 1 moves and is not cancelled, the system shall call `sleep` exactly n − 1 times, each with `gapMs`.', async () => {
    const cases = [
      { n: 2, gapMs: 400 },
      { n: 3, gapMs: 400 },
      { n: 4, gapMs: 50 },
    ] as const;
    for (const { n, gapMs } of cases) {
      const start = openingState();
      const moves = plannedMoves(n);
      const { rules } = stubRules();
      const rec = recorder();
      await applyMovesSequentially(rules, start, moves, playbackOpts(rec, gapMs));
      expect(rec.sleeps, `n=${String(n)}`).toEqual(Array.from({ length: n - 1 }, () => gapMs));
    }
  });

  it('When playback is given 0 or 1 moves, the system shall not call `sleep`.', async () => {
    for (const n of [0, 1] as const) {
      const start = openingState();
      const moves = plannedMoves(n);
      const { rules } = stubRules();
      const rec = recorder();
      await applyMovesSequentially(rules, start, moves, playbackOpts(rec));
      expect(rec.sleeps, `n=${String(n)}`).toEqual([]);
      expect(rec.applied, `n=${String(n)}`).toHaveLength(n);
    }
  });

  it('The system shall apply moves in the given list order, each via `rules.apply` on the state produced by the previous apply (or `start` for the first).', async () => {
    const start = openingState();
    const moves = plannedMoves(3);
    const { rules, applyCalls } = stubRules();
    const rec = recorder();
    await applyMovesSequentially(rules, start, moves, playbackOpts(rec));
    expect(applyCalls.map((call) => call.move)).toEqual(moves);
    expect(applyCalls[0]?.state).toBe(start);
    for (let i = 1; i < applyCalls.length; i += 1) {
      expect(applyCalls[i]?.state).toBe(rec.applied[i - 1]?.after);
    }
    expect(rec.applied.map((event) => event.after)).toHaveLength(3);
  });

  it('When `cancelled` is true before an apply, the system shall apply no further moves and shall not call `onApplied` for them.', async () => {
    const start = openingState();
    const moves = plannedMoves(3);
    const { rules, applyCalls } = stubRules();
    const rec = recorder({ cancelled: true });
    const result = await applyMovesSequentially(rules, start, moves, playbackOpts(rec));
    expect(applyCalls).toHaveLength(0);
    expect(rec.applied).toHaveLength(0);
    expect(rec.sleeps).toHaveLength(0);
    expect(result).toBe(start);
  });

  it('When `cancelled` becomes true during a gap, the system shall not apply later moves.', async () => {
    const start = openingState();
    const moves = plannedMoves(3);
    const { rules, applyCalls } = stubRules();
    const rec = recorder({ cancelOnSleep: true });
    await applyMovesSequentially(rules, start, moves, playbackOpts(rec));
    expect(rec.applied).toHaveLength(1);
    expect(applyCalls).toHaveLength(1);
  });

  it('Equal `start` + `moves` shall yield equal intermediate states and the same final state as folding `rules.apply` (determinism of the sequence, not of wall-clock).', async () => {
    const start = openingState();
    const moves = plannedMoves(3);
    const { rules } = stubRules();
    const first = recorder();
    const second = recorder();
    const left = await applyMovesSequentially(rules, start, moves, playbackOpts(first));
    const right = await applyMovesSequentially(rules, start, moves, playbackOpts(second));
    expect(first.applied.map((event) => event.after)).toEqual(
      second.applied.map((event) => event.after),
    );
    let folded = start;
    for (const move of moves) {
      folded = rules.apply(folded, move);
    }
    expect(left).toEqual(right);
    expect(left).toEqual(folded);
  });

  it('The playback helper shall not call `Date.now`, `Math.random`, or `setTimeout`; `sleep` is injected.', () => {
    const src = botPlaybackSource();
    expect(src).not.toContain('Date.now');
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('setTimeout');
  });

  it('While the same local AI player is active and the match is not over, the chair key shall not change because occupancy or the match log changed.', () => {
    const left = openingState();
    const right = occupancyShifted(left);
    const opts = localAiOpts(left);
    expect(localAiChairKey(left, opts)).toBe(activeId(left));
    expect(localAiChairKey(right, opts)).toBe(activeId(left));
    expect(localAiChairKey(left, opts)).toBe(localAiChairKey(right, opts));
  });

  it('When play is online, or `winner` is set, or the active seat is not AI, the chair key shall be `null`.', () => {
    const playing = openingState();
    const winner = playing.players[0];
    expect(winner).toBeDefined();
    if (winner === undefined) return;
    const over = withWinner(playing, winner);
    const ai = isAiSeatOf(activeId(playing));
    const cases: readonly { label: string; key: string | null }[] = [
      {
        label: 'online',
        key: localAiChairKey(playing, { online: true, isAiSeat: ai }),
      },
      {
        label: 'winner',
        key: localAiChairKey(over, { online: false, isAiSeat: ai }),
      },
      {
        label: 'human',
        key: localAiChairKey(playing, { online: false, isAiSeat: () => false }),
      },
    ];
    for (const row of cases) {
      expect(row.key, row.label).toBeNull();
    }
  });

  it('The rules engine shall be unchanged: no edit to `packages/rules-core`.', () => {
    const src = botPlaybackSource();
    expect(src).not.toContain('@conquarrow/rules-core');
    expect(src).not.toContain('rules-core');
  });

  it('Planning remains one burst per chair: playback shall not call the chooser.', () => {
    const src = botPlaybackSource();
    expect(src).not.toContain('playBotTurn');
    expect(src).not.toContain('playLlmBotTurn');
    expect(src).not.toContain('chooseMove');
  });
});
