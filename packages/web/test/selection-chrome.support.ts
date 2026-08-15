/**
 * Tiling + Galcon fixtures for P31 selection-chrome tests.
 * Reach dests are found by distance / allowed portions — not by hard-coded ids.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintArrowId, mintPlayerId } from '@conquarrow/contracts';
import type { ArrowId, GameState, Move, PlayerId } from '@conquarrow/contracts';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import { GalconInput, type InputHighlights, type InputSnapshot } from '../src/input/modes';
import { pathForDestination, type Reach, type ReachEntry } from '../src/reach';
import {
  selectionPaint,
  type PointerKind,
  type SelectionPaint,
} from '../src/selectionChrome';

export const geometry = makeTiling();
export const rules = makeRules(geometry);

export const selectionChromeSource = (): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/selectionChrome.ts'), 'utf8');

export const sortedIds = (arrows: Iterable<ArrowId>): string[] =>
  [...arrows].map(String).toSorted();

export const allowedOf = (entry: ReachEntry): number[] =>
  [...entry.plans.keys()].toSorted((left, right) => left - right);

export const entryWithPortions = (portions: readonly number[]): ReachEntry => {
  const dest = mintArrowId('p31-plan');
  const plans = new Map<number, readonly ArrowId[]>();
  for (const portion of portions) plans.set(portion, [dest]);
  const sorted = [...portions].toSorted((left, right) => left - right);
  const min = sorted[0] ?? 1;
  const max = sorted[sorted.length - 1] ?? min;
  return {
    distance: 1,
    minCount: min,
    maxCount: max,
    plans,
    paysBranchToll: false,
    mergeTrap: false,
  };
};

/** A lone stack of `heads` on otherwise empty occupancy. */
export const soloStack = (
  heads: number,
): { readonly state: GameState; readonly from: ArrowId; readonly owner: PlayerId } => {
  const opening = makeMatch();
  const owner = opening.activePlayer;
  const placed = [...opening.groups.entries()].find(([, group]) => group.owner === owner);
  if (placed === undefined) {
    throw new Error('setup: opening placed no group for the active player');
  }
  const [from] = placed;
  return {
    state: { ...opening, groups: new Map([[from, { owner, heads, spent: 0 }]]) },
    from,
    owner,
  };
};

export const pickSource = (
  heads: number,
): {
  readonly mode: GalconInput;
  readonly state: GameState;
  readonly from: ArrowId;
  readonly source: InputSnapshot;
} => {
  const { state, from } = soloStack(heads);
  const mode = new GalconInput(geometry);
  const source = mode.onArrowClick(from, state, rules);
  if (source.phase.kind !== 'source') {
    throw new Error(`setup: expected source phase, got ${source.phase.kind}`);
  }
  return { mode, state, from, source };
};

export const reachOf = (snap: InputSnapshot): Reach => {
  const reach = snap.highlights.reach;
  if (reach === undefined) throw new Error('setup: source snapshot has no reach');
  return reach;
};

export const findDest = (
  reach: Reach,
  pred: (entry: ReachEntry, arrow: ArrowId) => boolean,
  label: string,
): ArrowId => {
  for (const [arrow, entry] of reach) {
    if (pred(entry, arrow)) return arrow;
  }
  throw new Error(`setup: no dest ${label}`);
};

export const destAtDistance = (reach: Reach, distance: number): ArrowId =>
  findDest(reach, (entry) => entry.distance === distance, `at distance ${String(distance)}`);

export const destWithMinCount = (reach: Reach, minCount: number): ArrowId =>
  findDest(reach, (entry) => entry.minCount === minCount, `with minCount ${String(minCount)}`);

export const requireEntry = (reach: Reach, dest: ArrowId): ReachEntry => {
  const entry = reach.get(dest);
  if (entry === undefined) throw new Error(`setup: ${String(dest)} is not in reach`);
  return entry;
};

export const destOffPath = (reach: Reach, path: ReadonlySet<ArrowId>, from: ArrowId): ArrowId =>
  findDest(
    reach,
    (_entry, arrow) => arrow !== from && !path.has(arrow),
    'off the committed path',
  );

export const pathTo = (reach: Reach, dest: ArrowId): ReadonlySet<ArrowId> =>
  pathForDestination(reach, dest);

export const paintFor = (
  snap: Pick<InputSnapshot, 'phase' | 'highlights'>,
  pointer: PointerKind,
  hoverArrow?: ArrowId,
): SelectionPaint =>
  hoverArrow === undefined
    ? selectionPaint({ phase: snap.phase, highlights: snap.highlights, pointer })
    : selectionPaint({
        phase: snap.phase,
        highlights: snap.highlights,
        pointer,
        hoverArrow,
      });

export const lastStep = (
  pending: readonly Move[] | undefined,
): { readonly exit: ArrowId; readonly count: number; readonly length: number } | undefined => {
  if (pending === undefined || pending.length === 0) return undefined;
  const move = pending[pending.length - 1];
  if (move === undefined || move.kind !== 'step') return undefined;
  return { exit: move.exit, count: move.count, length: pending.length };
};

/** Stack-grade fragment facing enemy territory — P28 refused grain out. */
export const refusedConvertFixture = (): {
  readonly state: GameState;
  readonly from: ArrowId;
  readonly refused: ArrowId;
  readonly free: ArrowId;
} => {
  const A: PlayerId = mintPlayerId('A');
  const B: PlayerId = mintPlayerId('B');
  const from = geometry.outArrows(geometry.seedPoint())[0];
  if (from === undefined) throw new Error('setup: tiling offered no out-arrow at its seed');
  const outs = geometry.outArrows(geometry.target(from));
  const refused = outs[0];
  const free = outs[1];
  if (refused === undefined || free === undefined) {
    throw new Error('setup: need at least two grain outs');
  }
  const state: GameState = {
    players: [A, B],
    activePlayer: A,
    groups: new Map([[from, { owner: A, heads: 2, spent: 0 }]]),
    trails: new Map([[A, new Set([from])]]),
    territory: new Map([[refused, B]]),
    accumulators: new Map(),
    spawners: new Map(),
    dominationStreak: 0,
    dominationHolder: undefined,
    dominationN: 5,
    winner: undefined,
  };
  if (rules.anchorGrade(state, from, A) !== 'stack') {
    throw new Error('setup: expected stack-grade fragment');
  }
  return { state, from, refused, free };
};

export const withRefused = (
  highlights: InputHighlights,
  refused: ReadonlySet<ArrowId>,
): InputHighlights => (refused.size === 0 ? highlights : { ...highlights, refused });

/** Synthetic source highlights; `order` is Map insertion order of dests. */
export const syntheticSource = (
  from: ArrowId,
  dests: readonly (readonly [ArrowId, ReachEntry])[],
): InputHighlights => ({
  selected: from,
  targets: new Set(dests.map(([arrow]) => arrow)),
  reach: new Map(dests),
});

export const winnerState = (): GameState => {
  const opening = makeMatch();
  const winner = opening.players[0];
  if (winner === undefined) throw new Error('setup: opening has no players');
  return { ...opening, winner };
};
