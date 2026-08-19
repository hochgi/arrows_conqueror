/**
 * docs/spec/refuse-self-convert — adapter scenarios (core Rule "the board
 * teaches the refused grain exit" + edge Rule "adapter clicks and hover seams").
 *
 * Pure helpers + reachFrom + GalconInput. No jsdom, no RTL.
 *
 * @see docs/spec/refuse-self-convert/refuse-self-convert.md
 */

import { describe, expect, it } from 'vitest';
import { mintPlayerId, rational } from '@conquarrow/contracts';
import type { ArrowId, GameState, PlayerId, VertexId } from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import { GalconInput } from '../src/input/modes';
import { reachFrom } from '../src/reach';
import {
  CONVERT_REFUSED_COPY,
  convertTooltip,
  refusedConvertExits,
  refusedCursor,
} from '../src/refusedConvert';
import { spawnerInfoAt } from '../src/spawnerInfo';

const A: PlayerId = mintPlayerId('A');
const B: PlayerId = mintPlayerId('B');
const LOCKED_TIP = 'Would convert. This is their territory, and you have no trail home.';

const geometry = makeTiling();
const rules = makeRules(geometry);

const grainFromSeed = (): { readonly from: ArrowId; readonly outs: readonly ArrowId[] } => {
  const from = geometry.outArrows(geometry.seedPoint())[0];
  if (from === undefined) throw new Error('setup: tiling offered no out-arrow at its seed');
  const outs = geometry.outArrows(geometry.target(from));
  if (outs.length < 2) throw new Error('setup: need at least two grain outs');
  return { from, outs };
};

const stateOf = (
  placements: readonly { readonly arrow: ArrowId; readonly owner: PlayerId; readonly heads: number }[],
  ground: {
    readonly trail?: readonly ArrowId[];
    readonly territory?: readonly { readonly arrow: ArrowId; readonly owner: PlayerId }[];
    readonly spawners?: readonly (readonly [VertexId, { readonly force: ReturnType<typeof rational>; readonly phase: number }])[];
  } = {},
): GameState => ({
  players: [A, B],
  activePlayer: A,
  groups: new Map(
    placements.map((p) => [p.arrow, { owner: p.owner, heads: p.heads, spent: 0 }] as const),
  ),
  trails:
    ground.trail !== undefined && ground.trail.length > 0
      ? new Map([[A, new Set(ground.trail)]])
      : new Map(),
  territory: new Map((ground.territory ?? []).map((t) => [t.arrow, t.owner] as const)),
  accumulators: new Map(),
  spawners: new Map(ground.spawners ?? []),
  dominationStreak: 0,
  dominationHolder: undefined,
  dominationN: 5,
  winner: undefined,
});

const stackGradeAgainstEnemy = (
  heads: number,
): {
  readonly from: ArrowId;
  readonly enemyExit: ArrowId;
  readonly freeExit: ArrowId;
  readonly state: GameState;
} => {
  const { from, outs } = grainFromSeed();
  const enemyExit = outs[0];
  const freeExit = outs[1];
  if (enemyExit === undefined || freeExit === undefined) {
    throw new Error('setup: missing grain outs');
  }
  const state = stateOf([{ arrow: from, owner: A, heads }], {
    trail: [from],
    territory: [{ arrow: enemyExit, owner: B }],
  });
  if (rules.anchorGrade(state, from, A) !== 'stack') {
    throw new Error('setup: expected stack-grade fragment');
  }
  return { from, enemyExit, freeExit, state };
};

describe('the board teaches the refused grain exit', () => {
  it('presents grain-adjacent enemy territory from an unprotected selected stack as a refused target', () => {
    // core: "Grain-adjacent enemy territory from an unprotected selected stack is a refused target"
    const { from, enemyExit, state } = stackGradeAgainstEnemy(1);

    expect(reachFrom(geometry, rules, state, from).has(enemyExit)).toBe(false);
    expect(refusedConvertExits(state, geometry, rules, from).has(enemyExit)).toBe(true);
    expect(refusedCursor(state, geometry, rules, from, enemyExit)).toBe('not-allowed');
    expect(convertTooltip(state, geometry, rules, from, enemyExit)).toBe(LOCKED_TIP);
  });

  it('treats a protected raid’s grain out as ordinary reach, not a convert refusal', () => {
    // core: "Protected raid: the same grain out is ordinary reach"
    const { from, outs } = grainFromSeed();
    const exit = outs[0];
    if (exit === undefined) throw new Error('setup: missing grain out');
    const home = geometry.inArrows(geometry.origin(from))[0];
    if (home === undefined) throw new Error('setup: missing home feeder');
    const state = stateOf([{ arrow: from, owner: A, heads: 1 }], {
      trail: [from],
      territory: [
        { arrow: home, owner: A },
        { arrow: exit, owner: B },
      ],
    });
    if (rules.anchorGrade(state, from, A) !== 'territory') {
      throw new Error('setup: expected territory-grade raid');
    }

    expect(reachFrom(geometry, rules, state, from).has(exit)).toBe(true);
    expect(refusedConvertExits(state, geometry, rules, from).has(exit)).toBe(false);
    expect(convertTooltip(state, geometry, rules, from, exit)).toBeUndefined();
    expect(refusedCursor(state, geometry, rules, from, exit)).toBeUndefined();
  });
});

describe('adapter clicks and hover seams', () => {
  it('drafts nothing and applies nothing when the refused target is clicked', () => {
    // edge: "Clicking a refused target drafts nothing and does not apply"
    // P34 retired the portion picker outright and renamed the selected phase to
    // `route`, so "no picker opens" now holds by construction; what this scenario
    // still guards is that the click applies nothing, drafts nothing, and does not
    // drop the selection — the refused exit is not in the clickable set.
    const { from, enemyExit, state } = stackGradeAgainstEnemy(16);
    const mode = new GalconInput(geometry);
    const selected = mode.onArrowClick(from, state, rules);
    expect(selected.phase.kind).toBe('route');
    if (selected.phase.kind === 'route') {
      expect(selected.phase.offer.clickable.has(enemyExit)).toBe(false);
    }

    const afterClick = mode.onArrowClick(enemyExit, state, rules);
    expect(afterClick.phase.kind).toBe('route');
    if (afterClick.phase.kind === 'route') {
      expect(afterClick.phase.from).toBe(from);
      expect(afterClick.phase.draft).toHaveLength(0);
    }
    expect(afterClick.pending).toBeUndefined();
  });

  it('treats an unclaimed grain out from the same fragment as ordinary reach', () => {
    // edge: "Unclaimed grain out from the same fragment is ordinary reach"
    const { from, enemyExit, freeExit, state } = stackGradeAgainstEnemy(1);
    expect(state.territory.get(freeExit)).toBeUndefined();
    expect(freeExit).not.toBe(enemyExit);

    expect(reachFrom(geometry, rules, state, from).has(freeExit)).toBe(true);
    expect(refusedConvertExits(state, geometry, rules, from).has(freeExit)).toBe(false);
    expect(convertTooltip(state, geometry, rules, from, freeExit)).toBeUndefined();
  });

  it('shows no convert tooltip when no stack is selected, and leaves spawner hover unchanged', () => {
    // edge: "No convert tooltip when no stack is selected"
    const { enemyExit, state: base } = stackGradeAgainstEnemy(1);
    const vertex = geometry.flankVertices(enemyExit)[0];
    if (vertex === undefined) throw new Error('setup: exit flanks no vertex');
    const state = {
      ...base,
      spawners: new Map([[vertex, { force: rational(1, 9), phase: 0 }]]),
    };

    expect(convertTooltip(state, geometry, rules, undefined, enemyExit)).toBeUndefined();
    expect(refusedCursor(state, geometry, rules, undefined, enemyExit)).toBeUndefined();
    expect(spawnerInfoAt(geometry, state, vertex)).toBeDefined();
  });

  it('lets the convert tooltip win over spawner hover on a refused convert exit', () => {
    // edge: "Convert tooltip wins over spawner hover"
    const { from, enemyExit, state: base } = stackGradeAgainstEnemy(1);
    const vertex = geometry.flankVertices(enemyExit)[0];
    if (vertex === undefined) throw new Error('setup: exit flanks no vertex');
    const state = {
      ...base,
      spawners: new Map([[vertex, { force: rational(1, 9), phase: 0 }]]),
    };

    expect(spawnerInfoAt(geometry, state, vertex)).toBeDefined();
    expect(convertTooltip(state, geometry, rules, from, enemyExit)).toBe(LOCKED_TIP);
    expect(convertTooltip(state, geometry, rules, from, enemyExit)).toBe(CONVERT_REFUSED_COPY);
    expect(convertTooltip(state, geometry, rules, from, enemyExit)).not.toMatch(/force|share|spawner/i);
  });

  it('locks the convert tooltip string; HUD help must not replace it', () => {
    // edge: "Hud help may mention the refusal; the tooltip string stays locked"
    expect(CONVERT_REFUSED_COPY).toBe(LOCKED_TIP);
    expect(CONVERT_REFUSED_COPY).toBe(
      'Would convert. This is their territory, and you have no trail home.',
    );
    expect(CONVERT_REFUSED_COPY).not.toMatch(/encircled|surrounded|illegal move/i);
  });
});
