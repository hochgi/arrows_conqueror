import { describe, expect, it } from 'vitest';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import { GalconInput } from '../src/input/modes';

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
    expect(afterDest.highlights.path?.size).toBe(afterDest.phase.steps);

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

    // Slider preview keeps the path in sync with the portion.
    mode.onArrowClick(from, state, rules);
    const again = mode.onArrowClick(exit, state, rules);
    if (again.phase.kind !== 'portion') return;
    const previewed = mode.previewPortion(again.phase.min);
    expect(previewed.highlights.path?.size).toBe(again.phase.steps);
  });

  it('skips the slider when only one portion can arrive', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const A = opening.players[0];
    expect(A).toBeDefined();
    if (A === undefined) return;
    const from = [...opening.groups.entries()].find(([, g]) => g.owner === A)?.[0];
    expect(from).toBeDefined();
    if (from === undefined) return;
    // A lone head has max=min=1 on every reachable exit.
    const state = {
      ...opening,
      groups: new Map([[from, { owner: A, heads: 1, spent: 0 }]]),
    };
    const mode = new GalconInput(geometry);
    const selected = mode.onArrowClick(from, state, rules);
    expect(selected.phase.kind).toBe('source');
    const dest = [...selected.highlights.targets][0];
    expect(dest).toBeDefined();
    if (dest === undefined) return;
    const committed = mode.onArrowClick(dest, state, rules);
    expect(committed.phase.kind).toBe('idle');
    expect(committed.pending).toHaveLength(1);
  });

  it('offers destinations from a join that formerly paid a branch toll (P22)', () => {
    // P22: branching is free — a lone head on a join is selectable with reach, not blocked.
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const A = opening.players[0];
    const B = opening.players[1];
    expect(A).toBeDefined();
    expect(B).toBeDefined();
    if (A === undefined || B === undefined) return;
    const arrow = (s: string) => s as import('@conquarrow/contracts').ArrowId;
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
    const atJoin = mode.onArrowClick(arrow('tiling:a:5,1,0'), state, rules);
    expect(atJoin.phase.kind).toBe('source');
    expect(atJoin.highlights.targets.size).toBeGreaterThan(0);

    const movable = mode.onArrowClick(arrow('tiling:a:5,1,2'), state, rules);
    expect(movable.phase.kind).toBe('source');
    expect(movable.highlights.targets.size).toBeGreaterThan(0);
  });
});

/**
 * Event 11: a click that cannot do anything says so, at the tile it happened on.
 *
 * These used to be silent — `onArrowClick` returned the unchanged snapshot and the
 * player was left to infer the constraint. The reason rides on the snapshot the
 * refused click produced, and only that one, so a later no-op cannot re-fire it.
 */
describe('Galcon input — refusals', () => {
  const setup = () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const state = makeMatch();
    return { geometry, rules, state, mode: new GalconInput(geometry) };
  };

  it('names an unowned tile clicked with nothing selected', () => {
    const { geometry, rules, state, mode } = setup();
    const mine = activeGroup(state);
    expect(mine).toBeDefined();
    if (mine === undefined) return;
    // Any arrow that is not one of ours, taken from the board rather than invented.
    const other = geometry.outArrows(geometry.target(mine)).find((a) => !state.groups.has(a));
    expect(other).toBeDefined();
    if (other === undefined) return;

    const snap = mode.onArrowClick(other, state, rules);
    expect(snap.refusal?.arrow).toBe(other);
    expect(snap.refusal?.reason).toBe('not-yours');
    // A refusal changes nothing: no phase change, and nothing to apply.
    expect(snap.phase.kind).toBe('idle');
    expect(snap.pending).toBeUndefined();
  });

  it('names an out-of-reach tile clicked while a stack is selected', () => {
    const { geometry, rules, state, mode } = setup();
    const from = activeGroup(state);
    expect(from).toBeDefined();
    if (from === undefined) return;
    const selected = mode.onArrowClick(from, state, rules);
    expect(selected.refusal).toBeUndefined();

    // Walk the grain until we are past everything this stack can reach this turn.
    let far = from;
    for (let i = 0; i < 12; i += 1) {
      const next = geometry.outArrows(geometry.target(far))[0];
      if (next === undefined) break;
      far = next;
    }
    expect(selected.highlights.targets.has(far)).toBe(false);

    const snap = mode.onArrowClick(far, state, rules);
    expect(snap.refusal?.arrow).toBe(far);
    expect(snap.refusal?.reason).toBe('out-of-reach');
    // Still selected — a refused destination must not drop the selection.
    expect(snap.phase.kind).toBe('source');
  });

  it('does not carry a refusal into the next snapshot', () => {
    const { geometry, rules, state, mode } = setup();
    const mine = activeGroup(state);
    expect(mine).toBeDefined();
    if (mine === undefined) return;
    const other = geometry.outArrows(geometry.target(mine)).find((a) => !state.groups.has(a));
    expect(other).toBeDefined();
    if (other === undefined) return;

    expect(mode.onArrowClick(other, state, rules).refusal).toBeDefined();
    // The very next thing that *works* comes back clean.
    expect(mode.onArrowClick(mine, state, rules).refusal).toBeUndefined();
    expect(mode.reset().refusal).toBeUndefined();
  });

  it('names a skip that is not on offer', () => {
    const { rules, state, mode } = setup();
    // Nothing selected: there is no group to skip, so the request cannot apply.
    const snap = mode.requestSkip(state, rules);
    expect(snap.pending).toBeUndefined();
    expect(snap.refusal).toBeUndefined();
  });
});
