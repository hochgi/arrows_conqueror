/**
 * Hand-authored GameState on the generated tiling for P29 victory FX tests.
 * Spawners and share arrows come from makeMatch — not from rules-core.
 */

import { rational } from '@conquarrow/contracts';
import type { ArrowId, GameState, PlayerId } from '@conquarrow/contracts';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import type { VictoryHow, VictoryFx } from '../src/fx/victory';

export const geometry = makeTiling();

export const cmpId = (left: unknown, right: unknown): number => {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

export const sortedIds = (arrows: Iterable<ArrowId>): string[] =>
  [...arrows].map(String).toSorted();

export const shineOf = (fx: VictoryFx): ReadonlySet<ArrowId> =>
  fx.kind === 'over' ? fx.shineArrows : new Set();

export const pulseOf = (fx: VictoryFx): ReadonlySet<ArrowId> =>
  fx.kind === 'over' ? fx.pulseArrows : new Set();

export const bannerOf = (fx: VictoryFx): string | undefined =>
  fx.kind === 'over' ? fx.banner : undefined;

export const hintOf = (fx: VictoryFx): string | undefined =>
  fx.kind === 'over' ? fx.hint : undefined;

export const howOf = (fx: VictoryFx): VictoryHow | undefined =>
  fx.kind === 'over' ? fx.how : undefined;

export const seatsOf = (state: GameState): { a: PlayerId; b: PlayerId } => {
  const a = state.players[0];
  const b = state.players[1];
  if (a === undefined || b === undefined) throw new Error('setup: need two seats');
  return { a, b };
};

export const groupOn = (state: GameState, player: PlayerId): ArrowId => {
  for (const [arrow, group] of state.groups) {
    if (group.owner === player) return arrow;
  }
  throw new Error(`setup: ${String(player)} has no group`);
};

export const headsOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const group of state.groups.values()) {
    if (group.owner === player) n += group.heads;
  }
  return n;
};

export const livingCount = (state: GameState): number =>
  state.players.filter((player) => headsOf(state, player) > 0).length;

/** Share arrows: spawners.keys stable id order, then borderArrows stable id order. */
export const shareArrowsOf = (state: GameState): ArrowId[] => {
  const out: ArrowId[] = [];
  const seen = new Set<string>();
  const vertices = [...state.spawners.keys()].toSorted(cmpId);
  for (const vertex of vertices) {
    for (const arrow of [...geometry.borderArrows(vertex)].toSorted(cmpId)) {
      if (seen.has(String(arrow))) continue;
      seen.add(String(arrow));
      out.push(arrow);
    }
  }
  return out;
};

export const winnerOwnedShares = (state: GameState, winner: PlayerId): ArrowId[] =>
  shareArrowsOf(state).filter((arrow) => state.territory.get(arrow) === winner);

export const aNonShareArrow = (state: GameState): ArrowId => {
  const shares = new Set(shareArrowsOf(state).map(String));
  for (const radius of [2, 4, 8, 12]) {
    for (const arrow of geometry.window(geometry.seedPoint(), radius).arrows) {
      if (!shares.has(String(arrow))) return arrow;
    }
  }
  throw new Error('setup: no non-share arrow in the window');
};

export const anEmptyArrow = (state: GameState): ArrowId => {
  const trailKeys = new Set<string>();
  for (const arrows of state.trails.values()) {
    for (const arrow of arrows) trailKeys.add(String(arrow));
  }
  for (const radius of [2, 4, 8, 12]) {
    for (const arrow of geometry.window(geometry.seedPoint(), radius).arrows) {
      if (state.territory.has(arrow)) continue;
      if (state.groups.has(arrow)) continue;
      if (trailKeys.has(String(arrow))) continue;
      return arrow;
    }
  }
  throw new Error('setup: no empty-ground arrow in the window');
};

const dropLosers = (state: GameState, winner: PlayerId): GameState => ({
  ...state,
  groups: new Map([...state.groups].filter(([, group]) => group.owner === winner)),
});

/** Winner set, exactly one living player (elimination). Opening home shares stay. */
export const eliminationBoard = (): {
  state: GameState;
  a: PlayerId;
  b: PlayerId;
  g1: ArrowId;
} => {
  const opening = makeMatch();
  const { a, b } = seatsOf(opening);
  const stripped = dropLosers(opening, a);
  return { state: { ...stripped, winner: a }, a, b, g1: groupOn(stripped, a) };
};

/** Winner set, two or more living players (starvation). */
export const starvationBoard = (): {
  state: GameState;
  a: PlayerId;
  b: PlayerId;
  gA: ArrowId;
  gB: ArrowId;
} => {
  const opening = makeMatch();
  const { a, b } = seatsOf(opening);
  return {
    state: { ...opening, winner: a },
    a,
    b,
    gA: groupOn(opening, a),
    gB: groupOn(opening, b),
  };
};

export const playingBoard = (): { state: GameState; a: PlayerId; b: PlayerId } => {
  const state = makeMatch();
  const { a, b } = seatsOf(state);
  return { state, a, b };
};

/** A owns s1, s2 (shares) and t1 (non-share land). Elimination so how is last-head. */
export const shineBoard = (): {
  state: GameState;
  a: PlayerId;
  s1: ArrowId;
  s2: ArrowId;
  t1: ArrowId;
} => {
  const opening = makeMatch();
  const { a } = seatsOf(opening);
  const owned = winnerOwnedShares(opening, a);
  const s1 = owned[0];
  const s2 = owned[1];
  if (s1 === undefined || s2 === undefined) {
    throw new Error('setup: opening home did not give A two share arrows');
  }
  const t1 = aNonShareArrow(opening);
  const territory = new Map(opening.territory);
  territory.set(t1, a);
  const stripped = dropLosers({ ...opening, territory }, a);
  return { state: { ...stripped, winner: a }, a, s1, s2, t1 };
};

/** Share that will birth a head on the next full round (yield-soon strength 1). */
export const yieldSoonBoard = (over: boolean): { state: GameState; a: PlayerId; s1: ArrowId } => {
  const opening = makeMatch();
  const { a } = seatsOf(opening);
  const vertex = [...opening.spawners.keys()].toSorted(cmpId)[0];
  if (vertex === undefined) throw new Error('setup: opening placed no spawners');
  const s1 = [...geometry.borderArrows(vertex)].toSorted(cmpId)[0];
  if (s1 === undefined) throw new Error('setup: spawner has no border arrows');
  const territory = new Map(opening.territory);
  territory.set(s1, a);
  const accumulators = new Map(opening.accumulators);
  accumulators.set(s1, rational(8, 9));
  const spawners = new Map(opening.spawners);
  spawners.set(vertex, { force: rational(1, 9), phase: 0 });
  const next: GameState = { ...opening, territory, accumulators, spawners, winner: undefined };
  return { state: over ? { ...next, winner: a } : next, a, s1 };
};

export const dimBoard = (): {
  state: GameState;
  a: PlayerId;
  b: PlayerId;
  x: ArrowId;
  y: ArrowId;
  z: ArrowId;
} => {
  const opening = makeMatch();
  const { a, b } = seatsOf(opening);
  const z = winnerOwnedShares(opening, a)[0];
  const y = winnerOwnedShares(opening, b)[0];
  if (z === undefined || y === undefined) {
    throw new Error('setup: each seat needs a home share');
  }
  const x = anEmptyArrow(opening);
  return { state: { ...opening, winner: a }, a, b, x, y, z };
};

export const trailBoard = (): { state: GameState; a: PlayerId; u1: ArrowId } => {
  const opening = makeMatch();
  const { a } = seatsOf(opening);
  const u1 = aNonShareArrow(opening);
  const trails = new Map(opening.trails);
  trails.set(a, new Set([u1]));
  return { state: { ...opening, trails, winner: a }, a, u1 };
};

export const noShareBoard = (): { state: GameState; a: PlayerId; g1: ArrowId } => {
  const opening = makeMatch();
  const { a } = seatsOf(opening);
  const shares = new Set(shareArrowsOf(opening).map(String));
  const g1 = aNonShareArrow(opening);
  const territory = new Map(
    [...opening.territory].filter(([arrow]) => !shares.has(String(arrow))),
  );
  const groups = new Map<ArrowId, { owner: PlayerId; heads: number; spent: number }>([
    [g1, { owner: a, heads: 1, spent: 0 }],
  ]);
  return { state: { ...opening, territory, groups, winner: a }, a, g1 };
};

export const blockadedBoard = (): { state: GameState; a: PlayerId; s1: ArrowId } => {
  const opening = makeMatch();
  const { a, b } = seatsOf(opening);
  const gA = groupOn(opening, a);
  const s1 = winnerOwnedShares(opening, a).find((arrow) => arrow !== gA);
  if (s1 === undefined) throw new Error('setup: need an A share that is not the garrison');
  const groups = new Map(opening.groups);
  groups.set(s1, { owner: b, heads: 1, spent: 0 });
  return { state: { ...opening, groups, winner: a }, a, s1 };
};

export const leftoverClockBoard = (): { state: GameState; a: PlayerId; b: PlayerId } => {
  const { state, a, b } = eliminationBoard();
  return {
    a,
    b,
    state: {
      ...state,
      dominationHolder: b,
      dominationStreak: state.dominationN,
    },
  };
};

/** Same shares, Maps built in opposite insertion order. */
export const reversedShareBoards = (): {
  left: GameState;
  right: GameState;
  a: PlayerId;
  s1: ArrowId;
  s2: ArrowId;
} => {
  const opening = makeMatch();
  const { a } = seatsOf(opening);
  const owned = winnerOwnedShares(opening, a);
  const s1 = owned[0];
  const s2 = owned[1];
  if (s1 === undefined || s2 === undefined) {
    throw new Error('setup: need two A-owned shares');
  }
  const spawnersFwd = new Map(opening.spawners);
  const spawnersRev = new Map([...opening.spawners].toReversed());
  const terrFwd = new Map<ArrowId, PlayerId>();
  terrFwd.set(s1, a);
  terrFwd.set(s2, a);
  const terrRev = new Map<ArrowId, PlayerId>();
  terrRev.set(s2, a);
  terrRev.set(s1, a);
  const groupsFwd = new Map(opening.groups);
  const groupsRev = new Map([...opening.groups].toReversed());
  const left: GameState = {
    ...opening,
    winner: a,
    spawners: spawnersFwd,
    territory: terrFwd,
    groups: groupsFwd,
  };
  const right: GameState = {
    ...opening,
    winner: a,
    spawners: spawnersRev,
    territory: terrRev,
    groups: groupsRev,
  };
  return { left, right, a, s1, s2 };
};

export const snapshotState = (
  state: GameState,
): {
  winner: string | undefined;
  territory: string[];
  groups: string[];
  trails: string[];
  spawners: string[];
  dominationStreak: number;
  dominationHolder: string | undefined;
} => ({
  winner: state.winner === undefined ? undefined : String(state.winner),
  territory: [...state.territory]
    .map(([arrow, owner]) => `${String(arrow)}:${String(owner)}`)
    .toSorted(),
  groups: [...state.groups]
    .map(([arrow, group]) => `${String(arrow)}:${String(group.owner)}:${String(group.heads)}`)
    .toSorted(),
  trails: [...state.trails]
    .map(([player, arrows]) => `${String(player)}:${sortedIds(arrows).join(',')}`)
    .toSorted(),
  spawners: [...state.spawners.keys()].map(String).toSorted(),
  dominationStreak: state.dominationStreak,
  dominationHolder:
    state.dominationHolder === undefined ? undefined : String(state.dominationHolder),
});
