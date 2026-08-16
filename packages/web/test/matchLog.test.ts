import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  endTurn,
  mintArrowId,
  mintPlayerId,
  step,
  type GameState,
  type PlayerId,
} from '@conquarrow/contracts';
import {
  appendMoves,
  appendMovesWithSummary,
  createMatchLog,
  emptyMatchSummary,
  foldMatchSummary,
  formatMatchSummary,
  serializeMatchLog,
  withByokStats,
  withWinner,
} from '../src/matchLog';

const A = mintPlayerId('A');
const B = mintPlayerId('B');
const C = mintPlayerId('C');

const bare = (args: {
  players?: PlayerId[];
  territory?: Map<PlayerId extends never ? never : import('@conquarrow/contracts').ArrowId, PlayerId>;
  trails?: Map<PlayerId, Set<import('@conquarrow/contracts').ArrowId>>;
}): GameState =>
  ({
    players: args.players ?? [A, B],
    territory: args.territory ?? new Map(),
    trails: args.trails ?? new Map(),
  }) as unknown as GameState;

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
    expect(log.summary).toEqual(emptyMatchSummary());
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

  it('folds steps, closes, cuts and firstCloseAt', () => {
    const a0 = mintArrowId('a0');
    const a1 = mintArrowId('a1');
    const before = bare({
      trails: new Map([[B, new Set([a0, a1])]]),
    });
    const afterClose = bare({
      territory: new Map([[a0, A]]),
      trails: new Map([[B, new Set([a0, a1])]]),
    });
    const moves = [step(a0, a1, 1)];
    const s1 = foldMatchSummary(emptyMatchSummary(), moves, before, afterClose, 0);
    expect(s1.steps).toBe(1);
    expect(s1.closes).toBe(1);
    expect(s1.cuts).toBe(0);
    expect(s1.firstCloseAt).toBe(0);

    const afterCut = bare({
      territory: new Map([[a0, A]]),
      trails: new Map([[B, new Set([a1])]]),
    });
    const s2 = foldMatchSummary(s1, moves, afterClose, afterCut, 1);
    expect(s2.cuts).toBe(1);
    expect(s2.closes).toBe(1);
    expect(s2.firstCloseAt).toBe(0);
    expect(formatMatchSummary(s2)).toContain('first close @ move 0');
  });

  it('appendMovesWithSummary grows the log and summary together', () => {
    const log = createMatchLog({
      config: DEFAULT_MATCH_CONFIG,
      vsBot: false,
      botMode: 'none',
      seats: [
        { player: A, kind: 'human' },
        { player: B, kind: 'human' },
      ],
      humanSeat: A,
      botSeat: undefined,
    });
    const a0 = mintArrowId('t0');
    const before = bare({});
    const after = bare({ territory: new Map([[a0, A]]) });
    const next = appendMovesWithSummary(log, [step(a0, a0, 1), endTurn()], before, after);
    expect(next.moves).toHaveLength(2);
    expect(next.summary.steps).toBe(1);
    expect(next.summary.endTurns).toBe(1);
    expect(next.summary.closes).toBe(1);
  });
});
