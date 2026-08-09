import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  endTurn,
  mintArrowId,
  mintPlayerId,
  step,
} from '@arrows/contracts';
import {
  appendMoves,
  createMatchLog,
  serializeMatchLog,
  withWinner,
} from '../src/matchLog';

const A = mintPlayerId('A');
const B = mintPlayerId('B');

describe('matchLog', () => {
  it('appends moves and serializes as JSON', () => {
    const log = createMatchLog({
      config: DEFAULT_MATCH_CONFIG,
      vsBot: true,
      botMode: 'heuristic',
      humanSeat: A,
      botSeat: B,
      startedAt: '2026-08-06T00:00:00.000Z',
    });
    const next = withWinner(
      appendMoves(log, [
        step(mintArrowId('tiling:a:5,0,0'), mintArrowId('tiling:a:5,0,1'), 1),
        endTurn(),
      ]),
      B,
    );
    expect(next.moves).toHaveLength(2);
    expect(next.winner).toBe(B);
    const raw = serializeMatchLog(next);
    const parsed = JSON.parse(raw) as typeof next;
    expect(parsed.version).toBe(1);
    expect(parsed.vsBot).toBe(true);
    expect(parsed.botMode).toBe('heuristic');
    expect(parsed.moves[1]).toEqual({ kind: 'endTurn' });
  });
});
