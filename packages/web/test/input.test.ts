import { describe, expect, it } from 'vitest';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import { GalconInput, HommInput } from '../src/input/modes';

const activeGroup = (state: ReturnType<typeof makeMatch>) =>
  [...state.groups.entries()].find(([, g]) => g.owner === state.activePlayer)?.[0];

describe('Galcon input', () => {
  it('selects a source, then asks for a portion on a legal exit', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const state = makeMatch();
    const mode = new GalconInput(geometry);
    const from = activeGroup(state);
    expect(from).toBeDefined();
    if (from === undefined) return;

    const afterSource = mode.onArrowClick(from, state, rules);
    expect(afterSource.phase.kind).toBe('source');
    expect(afterSource.highlights.targets.size).toBeGreaterThan(0);

    const exit = [...afterSource.highlights.targets][0];
    expect(exit).toBeDefined();
    if (exit === undefined) return;

    const afterDest = mode.onArrowClick(exit, state, rules);
    expect(afterDest.phase.kind).toBe('portion');
    if (afterDest.phase.kind !== 'portion') return;

    // A trip is a *list* of steps now — one step per arrow crossed (reach.ts) — so the
    // last move must land on the exit and the first must leave the source.
    const committed = mode.choosePortion(afterDest.phase.max);
    const plan = committed.pending ?? [];
    expect(plan.length).toBeGreaterThan(0);
    const first = plan[0];
    const last = plan[plan.length - 1];
    expect(first?.kind).toBe('step');
    expect(last?.kind).toBe('step');
    if (first?.kind !== 'step' || last?.kind !== 'step') return;
    expect(first.from).toBe(from);
    expect(last.exit).toBe(exit);
    expect(plan.length).toBe(afterDest.phase.steps);
  });

  it('marks a branch-stuck stack as blocked instead of empty destinations', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const A = opening.players[0];
    const B = opening.players[1];
    expect(A).toBeDefined();
    expect(B).toBeDefined();
    if (A === undefined || B === undefined) return;
    const arrow = (s: string) => s as import('@arrows/contracts').ArrowId;
    const trailA = new Set(
      [
        'tiling:a:4,2,0',
        'tiling:a:5,1,0',
        'tiling:a:5,1,1',
        'tiling:a:5,1,2',
        'tiling:a:5,2,2',
        'tiling:a:6,0,1',
        'tiling:a:6,1,2',
        'tiling:a:6,2,2',
      ].map(arrow),
    );
    const state = {
      ...opening,
      activePlayer: A,
      groups: new Map([
        [arrow('tiling:a:5,2,2'), { owner: A, heads: 1, spent: 0 }],
        [arrow('tiling:a:5,1,0'), { owner: A, heads: 1, spent: 0 }],
        [arrow('tiling:a:5,1,2'), { owner: A, heads: 1, spent: 0 }],
        [arrow('tiling:a:6,-1,0'), { owner: B, heads: 3, spent: 0 }],
      ]),
      trails: new Map([[A, trailA]]),
    };
    const mode = new GalconInput(geometry);
    const blocked = mode.onArrowClick(arrow('tiling:a:5,1,0'), state, rules);
    expect(blocked.phase.kind).toBe('blocked');
    expect(blocked.highlights.targets.size).toBe(0);

    const movable = mode.onArrowClick(arrow('tiling:a:5,1,2'), state, rules);
    expect(movable.phase.kind).toBe('source');
    expect(movable.highlights.targets.size).toBeGreaterThan(0);
  });
});

describe('HoMM input', () => {
  it('requires a second click on the destination before portion', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const state = makeMatch();
    const mode = new HommInput(geometry);
    const from = activeGroup(state);
    expect(from).toBeDefined();
    if (from === undefined) return;

    mode.onArrowClick(from, state, rules);
    const dest = rules
      .legalMoves(state)
      .find((m) => m.kind === 'step' && m.from === from);
    expect(dest?.kind).toBe('step');
    if (dest?.kind !== 'step') return;

    const preview = mode.onArrowClick(dest.exit, state, rules);
    expect(preview.phase.kind).toBe('preview');
    expect(preview.pending).toBeUndefined();

    const portion = mode.onArrowClick(dest.exit, state, rules);
    expect(portion.phase.kind).toBe('portion');
  });
});
