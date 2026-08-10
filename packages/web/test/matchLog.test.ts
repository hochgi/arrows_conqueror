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
  withByokStats,
  withWinner,
} from '../src/matchLog';

const A = mintPlayerId('A');
const B = mintPlayerId('B');
const C = mintPlayerId('C');

describe('matchLog', () => {
  it('appends moves and serializes as JSON', () => {
    const log = createMatchLog({
      config: { ...DEFAULT_MATCH_CONFIG, playerCount: 3 },
      vsBot: true,
      botMode: 'mixed',
      seats: [
        { player: A, kind: 'human' },
        { player: B, kind: 'byok', model: 'local-a' },
        { player: C, kind: 'heuristic' },
      ],
      humanSeat: A,
      botSeat: B,
      startedAt: '2026-08-06T00:00:00.000Z',
    });
    const next = withWinner(
      withByokStats(
        appendMoves(log, [
          step(mintArrowId('tiling:a:5,0,0'), mintArrowId('tiling:a:5,0,1'), 1),
          endTurn(),
        ]),
        { llmHits: 1, llmFallbacks: 0, lastError: undefined },
        B,
      ),
      B,
    );
    expect(next.moves).toHaveLength(2);
    expect(next.winner).toBe(B);
    expect(next.byokStats?.llmHits).toBe(1);
    expect(next.byokStatsBySeat?.['B']?.llmHits).toBe(1);
    const raw = serializeMatchLog(next);
    const parsed = JSON.parse(raw) as typeof next;
    expect(parsed.version).toBe(1);
    expect(parsed.vsBot).toBe(true);
    expect(parsed.botMode).toBe('mixed');
    expect(parsed.seats).toHaveLength(3);
    expect(parsed.moves[1]).toEqual({ kind: 'endTurn' });
  });
});
