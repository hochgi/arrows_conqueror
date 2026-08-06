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
    const mode = new GalconInput();
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

    const committed = mode.choosePortion(afterDest.phase.max);
    expect(committed.pending?.kind).toBe('step');
    if (committed.pending?.kind !== 'step') return;
    expect(committed.pending.from).toBe(from);
    expect(committed.pending.exit).toBe(exit);
  });
});

describe('HoMM input', () => {
  it('requires a second click on the destination before portion', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const state = makeMatch();
    const mode = new HommInput();
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
