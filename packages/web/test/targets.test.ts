import { describe, expect, it } from 'vitest';
import { endTurn } from '@arrows/contracts';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import {
  clearTargetLocks,
  formatTargetsForPrompt,
  syncTargetLocks,
} from '../src/targets';

describe('BYOK target locks', () => {
  it('assigns findings to steppable stacks and stays deterministic', () => {
    clearTargetLocks();
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch({
      dominationN: 5,
      R: 7,
      homeOffset: 5,
      playerCount: 3,
      spawnerSeed: 1,
    });
    const B = opening.players[1];
    expect(B).toBeDefined();
    if (B === undefined) return;
    const state = rules.apply(opening, endTurn());
    const a = syncTargetLocks(geometry, rules, state, B);
    const b = syncTargetLocks(geometry, rules, state, B);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(formatTargetsForPrompt(a)).toContain('TARGETS');
    clearTargetLocks();
  });
});
