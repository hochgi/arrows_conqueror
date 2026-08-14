import type {
  ArrowId,
  GameState,
  Group,
  MergeOverride,
  PlayerId,
  Rational,
  Spawner,
  VertexId,
} from '@conquarrow/contracts';
import { mintArrowId, mintPlayerId, mintVertexId, rational } from '@conquarrow/contracts';
import { asRecord } from './invite-record';

export type StateSnapshot = {
  readonly players: readonly string[];
  readonly activePlayer: string;
  readonly groups: readonly {
    readonly arrow: string;
    readonly owner: string;
    readonly heads: number;
    readonly spent: number;
    readonly speedOverride?: MergeOverride;
  }[];
  readonly trails: readonly { readonly player: string; readonly arrows: readonly string[] }[];
  readonly territory: readonly { readonly arrow: string; readonly owner: string }[];
  readonly accumulators: readonly {
    readonly arrow: string;
    readonly num: number;
    readonly den: number;
  }[];
  readonly spawners: readonly {
    readonly vertex: string;
    readonly num: number;
    readonly den: number;
    readonly phase: number;
  }[];
  readonly dominationStreak: number;
  readonly dominationN: number;
  readonly dominationHolder?: string;
  readonly winner?: string;
};

export const snapshotState = (state: GameState): StateSnapshot => {
  const snap: {
    players: readonly string[];
    activePlayer: string;
    groups: StateSnapshot['groups'];
    trails: StateSnapshot['trails'];
    territory: StateSnapshot['territory'];
    accumulators: StateSnapshot['accumulators'];
    spawners: StateSnapshot['spawners'];
    dominationStreak: number;
    dominationN: number;
    dominationHolder?: string;
    winner?: string;
  } = {
    players: [...state.players].map(String),
    activePlayer: String(state.activePlayer),
    groups: [...state.groups.entries()]
      .map(([arrow, group]) =>
        group.speedOverride === undefined
          ? {
              arrow: String(arrow),
              owner: String(group.owner),
              heads: group.heads,
              spent: group.spent,
            }
          : {
              arrow: String(arrow),
              owner: String(group.owner),
              heads: group.heads,
              spent: group.spent,
              speedOverride: group.speedOverride,
            },
      )
      .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
    trails: [...state.trails.entries()]
      .map(([player, arrows]) => ({
        player: String(player),
        arrows: [...arrows].map(String).toSorted(),
      }))
      .toSorted((left, right) => (left.player < right.player ? -1 : 1)),
    territory: [...state.territory.entries()]
      .map(([arrow, owner]) => ({ arrow: String(arrow), owner: String(owner) }))
      .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
    accumulators: [...state.accumulators.entries()]
      .map(([arrow, r]) => ({ arrow: String(arrow), num: r.num, den: r.den }))
      .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
    spawners: [...state.spawners.entries()]
      .map(([vertex, spawner]) => ({
        vertex: String(vertex),
        num: spawner.force.num,
        den: spawner.force.den,
        phase: spawner.phase,
      }))
      .toSorted((left, right) => (left.vertex < right.vertex ? -1 : 1)),
    dominationStreak: state.dominationStreak,
    dominationN: state.dominationN,
  };
  if (state.dominationHolder !== undefined) {
    snap.dominationHolder = String(state.dominationHolder);
  }
  if (state.winner !== undefined) {
    snap.winner = String(state.winner);
  }
  return snap;
};

export const persistEnvelope = (version: number, state: GameState): string =>
  JSON.stringify({ version, state: snapshotState(state) });

const stringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined;
  return value as string[];
};

const mergeOverrideOf = (value: unknown): MergeOverride | undefined => {
  if (value === 0 || value === 1) return value;
  return undefined;
};

const hydrateGroups = (raw: unknown): Map<ArrowId, Group> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const groups = new Map<ArrowId, Group>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const arrow = rec['arrow'];
    const owner = rec['owner'];
    const heads = rec['heads'];
    const spent = rec['spent'];
    if (typeof arrow !== 'string' || typeof owner !== 'string') return undefined;
    if (typeof heads !== 'number' || typeof spent !== 'number') return undefined;
    const speedOverride = mergeOverrideOf(rec['speedOverride']);
    groups.set(
      mintArrowId(arrow),
      speedOverride === undefined
        ? { owner: mintPlayerId(owner), heads, spent }
        : { owner: mintPlayerId(owner), heads, spent, speedOverride },
    );
  }
  return groups;
};

const hydrateTrails = (raw: unknown): Map<PlayerId, Set<ArrowId>> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const trails = new Map<PlayerId, Set<ArrowId>>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const player = rec['player'];
    const arrows = stringList(rec['arrows']);
    if (typeof player !== 'string' || arrows === undefined) return undefined;
    trails.set(mintPlayerId(player), new Set(arrows.map(mintArrowId)));
  }
  return trails;
};

const hydrateTerritory = (raw: unknown): Map<ArrowId, PlayerId> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const territory = new Map<ArrowId, PlayerId>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const arrow = rec['arrow'];
    const owner = rec['owner'];
    if (typeof arrow !== 'string' || typeof owner !== 'string') return undefined;
    territory.set(mintArrowId(arrow), mintPlayerId(owner));
  }
  return territory;
};

const hydrateAccumulators = (raw: unknown): Map<ArrowId, Rational> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const accumulators = new Map<ArrowId, Rational>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const arrow = rec['arrow'];
    const num = rec['num'];
    const den = rec['den'];
    if (typeof arrow !== 'string' || typeof num !== 'number' || typeof den !== 'number') {
      return undefined;
    }
    accumulators.set(mintArrowId(arrow), rational(num, den));
  }
  return accumulators;
};

const hydrateSpawners = (raw: unknown): Map<VertexId, Spawner> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const spawners = new Map<VertexId, Spawner>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const vertex = rec['vertex'];
    const num = rec['num'];
    const den = rec['den'];
    const phase = rec['phase'];
    if (typeof vertex !== 'string' || typeof num !== 'number') return undefined;
    if (typeof den !== 'number' || typeof phase !== 'number') return undefined;
    spawners.set(mintVertexId(vertex), { force: rational(num, den), phase });
  }
  return spawners;
};

export const hydrateState = (value: unknown): GameState | undefined => {
  const rec = asRecord(value);
  if (rec === undefined) return undefined;
  const playersRaw = stringList(rec['players']);
  const activePlayer = rec['activePlayer'];
  const dominationStreak = rec['dominationStreak'];
  const dominationN = rec['dominationN'];
  if (playersRaw === undefined || typeof activePlayer !== 'string') return undefined;
  if (typeof dominationStreak !== 'number' || typeof dominationN !== 'number') return undefined;
  const groups = hydrateGroups(rec['groups']);
  const trails = hydrateTrails(rec['trails']);
  const territory = hydrateTerritory(rec['territory']);
  const accumulators = hydrateAccumulators(rec['accumulators']);
  const spawners = hydrateSpawners(rec['spawners']);
  if (
    groups === undefined ||
    trails === undefined ||
    territory === undefined ||
    accumulators === undefined ||
    spawners === undefined
  ) {
    return undefined;
  }
  const dominationHolderRaw = rec['dominationHolder'];
  const winnerRaw = rec['winner'];
  return {
    players: playersRaw.map(mintPlayerId),
    activePlayer: mintPlayerId(activePlayer),
    groups,
    trails,
    territory,
    accumulators,
    spawners,
    dominationStreak,
    dominationN,
    dominationHolder: typeof dominationHolderRaw === 'string' ? mintPlayerId(dominationHolderRaw) : undefined,
    winner: typeof winnerRaw === 'string' ? mintPlayerId(winnerRaw) : undefined,
  };
};

export const parsePersistedEnvelope = (
  raw: string,
): { readonly version: number; readonly state: unknown; readonly game: GameState } | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const rec = asRecord(parsed);
  if (rec === undefined) return undefined;
  const version = rec['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return undefined;
  const game = hydrateState(rec['state']);
  if (game === undefined) return undefined;
  return { version, state: rec['state'], game };
};
