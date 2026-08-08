import { describe, expect, it } from 'vitest';
import { speed } from '@arrows/contracts';
import type { ArrowId, GameState, PlayerId } from '@arrows/contracts';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import { planMoves, reachFrom, reachOpacity } from '../src/reach';

const geometry = makeTiling();
const rules = makeRules(geometry);

/** A lone stack of `heads` on open ground, with the board otherwise empty. */
const soloStack = (heads: number): { state: GameState; from: ArrowId; owner: PlayerId } => {
  const opening = makeMatch();
  const owner = opening.activePlayer;
  const entry = [...opening.groups.entries()].find(([, g]) => g.owner === owner);
  if (entry === undefined) throw new Error('setup: the opening placed no group for the active player');
  const [from] = entry;
  return {
    state: { ...opening, groups: new Map([[from, { owner, heads, spent: 0 }]]) },
    from,
    owner,
  };
};

const maxDistance = (reach: ReturnType<typeof reachFrom>): number => {
  let far = 0;
  for (const entry of reach.values()) if (entry.distance > far) far = entry.distance;
  return far;
};

describe('reach', () => {
  it('reaches exactly as far as §3 allowance pays for', () => {
    // speed(N) = 1 + floor(log2 N): 1 head one step, 2 two, 4 three, 8 four. The whole
    // point of showing reach is that this curve is otherwise invisible on the board.
    for (const heads of [1, 2, 4, 8]) {
      const { state, from } = soloStack(heads);
      expect(maxDistance(reachFrom(geometry, rules, state, from))).toBe(speed(heads));
    }
  });

  it('prices a far arrow at the fewest heads that arrive', () => {
    const { state, from } = soloStack(8);
    const reach = reachFrom(geometry, rules, state, from);

    for (const entry of reach.values()) {
      // The cheapest portion that buys `distance` steps is 2^(distance-1).
      expect(entry.minCount).toBe(2 ** (entry.distance - 1));
      expect(speed(entry.minCount)).toBeGreaterThanOrEqual(entry.distance);
    }
  });

  it('offers the whole stack as the largest portion', () => {
    const { state, from } = soloStack(4);
    const reach = reachFrom(geometry, rules, state, from);
    const near = [...reach.values()].filter((e) => e.distance === 1);

    expect(near.length).toBeGreaterThan(0);
    for (const entry of near) expect(entry.maxCount).toBe(4);
  });

  it('marks no branch toll on open linear ground', () => {
    const { state, from } = soloStack(4);
    const reach = reachFrom(geometry, rules, state, from);
    for (const entry of reach.values()) expect(entry.paysBranchToll).toBe(false);
  });

  it('plans one step per arrow crossed, from the source onward', () => {
    const { state, from } = soloStack(8);
    const reach = reachFrom(geometry, rules, state, from);
    const far = [...reach.entries()].find(([, e]) => e.distance === 3);
    expect(far).toBeDefined();
    if (far === undefined) return;
    const [target, entry] = far;
    const plan = entry.plans.get(entry.minCount);
    expect(plan).toBeDefined();
    if (plan === undefined) return;

    const moves = planMoves(from, plan, entry.minCount);

    expect(moves.length).toBe(3);
    expect(moves.every((m) => m.kind === 'step')).toBe(true);
    // Walking the plan through the real engine must land on the arrow it promised —
    // reach is computed by simulation precisely so this cannot drift.
    let at = state;
    for (const move of moves) at = rules.apply(at, move);
    expect(at.groups.get(target)?.heads).toBe(entry.minCount);
  });

  it('reaches nothing from an arrow the active player does not hold', () => {
    const { state } = soloStack(4);
    const foreign = [...state.groups.keys()][0];
    expect(foreign).toBeDefined();
    if (foreign === undefined) return;
    const empty = { ...state, groups: new Map() };

    expect(reachFrom(geometry, rules, empty, foreign).size).toBe(0);
  });

  it('fades with distance, down to a floor it never crosses', () => {
    // The fade *is* the price, so it has to be monotone. The floor matters just as much:
    // past four steps a portion costs 16+ heads and the arrow is nearly unreachable, but
    // it must still be *visible* — invisible reads as "not a legal target", which is a
    // different and wrong message.
    let previous = Number.POSITIVE_INFINITY;
    for (let d = 1; d <= 8; d += 1) {
      const o = reachOpacity(d);
      expect(o).toBeLessThanOrEqual(previous);
      expect(o).toBeGreaterThan(0.1);
      previous = o;
    }
    // Strictly decreasing over the distances a real stack can pay for.
    expect(reachOpacity(4)).toBeLessThan(reachOpacity(1));
  });
});
