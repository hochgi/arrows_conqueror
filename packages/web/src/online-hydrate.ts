/**
 * Hydrate GET `/games/…` snapshot JSON into a `GameState` the board can render.
 * Same envelope as `packages/online-api` persist — copied here so web never
 * imports that package.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

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
import { asRecord } from './online-parse';

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
    dominationHolder:
      typeof dominationHolderRaw === 'string' ? mintPlayerId(dominationHolderRaw) : undefined,
    winner: typeof winnerRaw === 'string' ? mintPlayerId(winnerRaw) : undefined,
  };
};
