import { describe, expect, it } from 'vitest';
import type { ArrowId, GameState, Move, PlayerId } from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import {
  burstLifetimeMs,
  createEvaporationBurst,
  EVAPORATE_MS,
  EVAPORATE_STAGGER_MS,
  pruneBursts,
} from '../src/fx/evaporation';

const arrow = (s: string): ArrowId => s as ArrowId;
const player = (s: string): PlayerId => s as PlayerId;

const bareState = (trails: Map<PlayerId, Set<ArrowId>>): GameState =>
  ({
    trails,
  }) as unknown as GameState;

describe('createEvaporationBurst', () => {
  it('returns undefined when trails are unchanged', () => {
    const a = arrow('a1');
    const trails = new Map([[player('A'), new Set([a])]]);
    const before = bareState(trails);
    const after = bareState(new Map([[player('A'), new Set([a])]]));
    expect(createEvaporationBurst(before, after, [], 1000)).toBeUndefined();
  });

  it('lists arrows that left a trail and staggers from cut exits first', () => {
    const a = arrow('a1');
    const b = arrow('b2');
    const c = arrow('c3');
    const before = bareState(new Map([[player('B'), new Set([a, b, c])]]));
    const after = bareState(new Map([[player('B'), new Set([c])]]));
    const moves: Move[] = [{ kind: 'step', from: arrow('x'), exit: b, count: 1 }];
    const burst = createEvaporationBurst(before, after, moves, 5000);
    expect(burst).toBeDefined();
    if (burst === undefined) return;
    expect(burst.cutArrow).toBe(b);
    expect(burst.arrows.map((x) => String(x.arrow))).toEqual(['b2', 'a1']);
    expect(burst.arrows[0]?.delayMs).toBe(0);
    expect(burst.arrows[1]?.delayMs).toBeGreaterThan(0);
    expect(burst.arrows.every((x) => x.player === player('B'))).toBe(true);
  });

  it('staggers by undirected distance from the cut when geometry is supplied', () => {
    const geometry = makeTiling();
    // Three arrows in a path on the real tiling: pick a known chevron chain.
    const mid = 'tiling:a:0,0,0' as ArrowId;
    const origin = geometry.origin(mid);
    const ins = geometry.inArrows(origin);
    const outs = geometry.outArrows(geometry.target(mid));
    const left = ins[0];
    const right = outs[0];
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (left === undefined || right === undefined) return;

    const before = bareState(new Map([[player('A'), new Set([left, mid, right])]]));
    const after = bareState(new Map([[player('A'), new Set()]]));
    const moves: Move[] = [{ kind: 'step', from: left, exit: mid, count: 1 }];
    const burst = createEvaporationBurst(before, after, moves, 9000, geometry);
    expect(burst).toBeDefined();
    if (burst === undefined) return;
    expect(burst.cutArrow).toBe(mid);
    const byArrow = new Map(burst.arrows.map((c) => [String(c.arrow), c.delayMs]));
    expect(byArrow.get(String(mid))).toBe(0);
    const sideDelay = byArrow.get(String(left)) ?? byArrow.get(String(right));
    expect(sideDelay).toBe(EVAPORATE_STAGGER_MS);
  });

  it('pruneBursts drops expired entries', () => {
    const a = arrow('a1');
    const before = bareState(new Map([[player('A'), new Set([a])]]));
    const after = bareState(new Map([[player('A'), new Set()]]));
    const burst = createEvaporationBurst(before, after, [], 1000);
    expect(burst).toBeDefined();
    if (burst === undefined) return;
    expect(pruneBursts([burst], 1000).length).toBe(1);
    expect(pruneBursts([burst], 1000 + burstLifetimeMs(burst) + 1).length).toBe(0);
    expect(burstLifetimeMs(burst)).toBeGreaterThanOrEqual(EVAPORATE_MS);
  });
});
