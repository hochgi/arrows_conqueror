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

const asRational = (num: unknown, den: unknown): Rational | undefined => {
  if (typeof num !== 'number' || typeof den !== 'number') return undefined;
  try {
    return rational(num, den);
  } catch {
    return undefined;
  }
};

const hydrateAccumulators = (raw: unknown): Map<ArrowId, Rational> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const accumulators = new Map<ArrowId, Rational>();
  for (const item of raw) {
    const rec = asRecord(item);
    if (rec === undefined) return undefined;
    const arrow = rec['arrow'];
    const force = asRational(rec['num'], rec['den']);
    if (typeof arrow !== 'string' || force === undefined) return undefined;
    accumulators.set(mintArrowId(arrow), force);
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
    const force = asRational(rec['num'], rec['den']);
    const phase = rec['phase'];
    if (typeof vertex !== 'string' || force === undefined) return undefined;
    if (typeof phase !== 'number') return undefined;
    spawners.set(mintVertexId(vertex), { force, phase });
  }
  return spawners;
};

/**
 * The clock a **pre-P36** snapshot carries, read off the retired
 * `dominationHolder` / `dominationStreak` pair.
 *
 * Dropping it would be a match outcome changed by omission: a seat persisted at
 * 4 of 5 would reload at 0 of 5 and get a free reprieve of up to `dominationN`
 * rounds. A streak of zero seeds nothing, because that is what absence already
 * means.
 */
const seedStreaksFromRetiredPair = (rec: Record<string, unknown>): Map<PlayerId, number> => {
  const holder = rec['dominationHolder'];
  const streak = rec['dominationStreak'];
  if (typeof holder !== 'string' || typeof streak !== 'number' || streak <= 0) {
    return new Map();
  }
  return new Map([[mintPlayerId(holder), streak]]);
};

/**
 * P36: `starvationStreaks` replaces the `dominationStreak` / `dominationHolder`
 * pair. **Absent is accepted as empty** — "absent means zero" is the field's own
 * semantics, so a snapshot written without the field still loads — *unless* the
 * retired pair is there with a live streak, in which case the clock is seeded
 * from it ({@link seedStreaksFromRetiredPair}).
 *
 * The shape of the record is the only thing to read here: the envelope's
 * `version` is the optimistic-concurrency revision (`game-handlers.ts`), not a
 * schema version, so it cannot gate a migration.
 */
const hydrateStreaks = (rec: Record<string, unknown>): Map<PlayerId, number> | undefined => {
  const raw = rec['starvationStreaks'];
  if (raw === undefined) return seedStreaksFromRetiredPair(rec);
  if (!Array.isArray(raw)) return undefined;
  const streaks = new Map<PlayerId, number>();
  for (const item of raw) {
    const entry = asRecord(item);
    if (entry === undefined) return undefined;
    const player = entry['player'];
    const streak = entry['streak'];
    if (typeof player !== 'string' || typeof streak !== 'number') return undefined;
    streaks.set(mintPlayerId(player), streak);
  }
  return streaks;
};

export const hydrateState = (value: unknown): GameState | undefined => {
  const rec = asRecord(value);
  if (rec === undefined) return undefined;
  const playersRaw = stringList(rec['players']);
  const activePlayer = rec['activePlayer'];
  const dominationN = rec['dominationN'];
  if (playersRaw === undefined || typeof activePlayer !== 'string') return undefined;
  if (typeof dominationN !== 'number') return undefined;
  const starvationStreaks = hydrateStreaks(rec);
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
    spawners === undefined ||
    starvationStreaks === undefined
  ) {
    return undefined;
  }
  const winnerRaw = rec['winner'];
  return {
    players: playersRaw.map(mintPlayerId),
    activePlayer: mintPlayerId(activePlayer),
    groups,
    trails,
    territory,
    accumulators,
    spawners,
    starvationStreaks,
    dominationN,
    winner: typeof winnerRaw === 'string' ? mintPlayerId(winnerRaw) : undefined,
  };
};
