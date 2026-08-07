import { describe, expect, it } from 'vitest';
import type { ArrowId, GameState, Group } from '@arrows/contracts';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import { hasLegalStep, passIfExhausted } from '../src/autoEndTurn';

const arrow = (s: string) => s as ArrowId;

describe('passIfExhausted', () => {
  it('leaves an opening position alone', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const state = makeMatch();
    expect(hasLegalStep(rules, state)).toBe(true);
    const result = passIfExhausted(rules, state);
    expect(result.state).toBe(state);
    expect(result.moves).toEqual([]);
  });

  it('ends the turn when only skips remain and records endTurn', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const A = opening.players[0];
    const B = opening.players[1];
    expect(A).toBeDefined();
    expect(B).toBeDefined();
    if (A === undefined || B === undefined) return;
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
    const groups = new Map<ArrowId, Group>([
      [arrow('tiling:a:5,1,0'), { owner: A, heads: 1, spent: 0 }],
      [arrow('tiling:a:5,2,2'), { owner: A, heads: 1, spent: 0 }],
      [arrow('tiling:a:6,-1,0'), { owner: B, heads: 3, spent: 0 }],
    ]);
    const state: GameState = {
      ...opening,
      activePlayer: A,
      groups,
      trails: new Map([[A, trailA]]),
    };
    expect(hasLegalStep(rules, state)).toBe(false);
    const { state: next, moves } = passIfExhausted(rules, state);
    expect(next.activePlayer).toBe(B);
    expect(hasLegalStep(rules, next)).toBe(true);
    expect(moves).toEqual([{ kind: 'endTurn' }]);
  });
});
