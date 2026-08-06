/**
 * Match setup for the generated tiling — hexagon homes, radial spawners, PoC
 * defaults (P09 / §7 / §8).
 *
 * Lives here rather than in rules-core because placement needs lattice
 * coordinates; the core must not import them.
 */

import {
  DEFAULT_MATCH_CONFIG,
  MAX_PLAYERS,
  MIN_PLAYERS,
  forceAtRadius,
  mintPlayerId,
  rational,
} from '@arrows/contracts';
import type {
  ArrowId,
  GameState,
  Group,
  MatchConfig,
  PlayerId,
  Spawner,
  VertexId,
} from '@arrows/contracts';
import {
  cellArrow,
  cellPoint,
  cellVertex,
  pointCell,
  vertexBorders,
  vertexCell,
} from './cells';
import type { Cell } from './cells';
import { makeTiling } from './tiling';

/** Grain-preserving reflection `(i,j) ↦ (i+j, −j)` (§2). Kept for tests. */
export const reflectCell = ({ i, j }: Cell): Cell => ({ i: i + j, j: -j });

const compareIds = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

/** Cube/hex distance on the triangular lattice from the origin. */
const cellDistance = ({ i, j }: Cell): number => {
  const k = -i - j;
  return (Math.abs(i) + Math.abs(j) + Math.abs(k)) / 2;
};

/**
 * The six corners of a hexagon at cube distance *D* from the origin, in
 * counter-clockwise order starting east.
 */
export const hexCorners = (D: number): readonly Cell[] => {
  const d = Math.max(1, Math.trunc(D));
  return [
    { i: d, j: 0 },
    { i: 0, j: d },
    { i: -d, j: d },
    { i: -d, j: 0 },
    { i: 0, j: -d },
    { i: d, j: -d },
  ];
};

const ROOT3_OVER_2 = Math.sqrt(3) / 2;

/** Nearest lattice cell to a world point (basis u=(1,0), v=(½,√3/2)). */
const nearestCell = (x: number, y: number): Cell => {
  const j = Math.round(y / ROOT3_OVER_2);
  const i = Math.round(x - j / 2);
  return { i, j };
};

/**
 * Equal angular span on a circle of Euclidean radius ≈ *D*, snapped to the
 * lattice. Used when player count is not 2/3/4/6.
 */
const equalSpanHomes = (n: number, D: number): Cell[] => {
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < n; k += 1) {
    const theta = (2 * Math.PI * k) / n;
    let cell = nearestCell(D * Math.cos(theta), D * Math.sin(theta));
    // Prefer exact distance *D* when the snap landed inside — project on cube axes.
    const dist = cellDistance(cell);
    if (dist > 0 && dist !== D) {
      const scale = D / dist;
      cell = {
        i: Math.round(cell.i * scale),
        j: Math.round(cell.j * scale),
      };
    }
    let key = `${String(cell.i)},${String(cell.j)}`;
    // Collision: walk around the ring until free.
    let guard = 0;
    while (seen.has(key) && guard < 36) {
      cell = { i: cell.i + (guard % 2 === 0 ? 1 : 0), j: cell.j + (guard % 2 === 1 ? 1 : -1) };
      key = `${String(cell.i)},${String(cell.j)}`;
      guard += 1;
    }
    seen.add(key);
    out.push(cell);
  }
  return out;
};

/**
 * Home cells for *n* players at hexagon radius *D*.
 *
 * | n | placement |
 * |---|---|
 * | 2 | opposite corners |
 * | 3 | every alternating corner |
 * | 4 | four corners; one opposite pair left free |
 * | 6 | all six corners |
 * | else | equal angular span (best-effort) |
 */
export const homeCellsFor = (n: number, D: number): readonly Cell[] => {
  const corners = hexCorners(D);
  const at = (index: number): Cell => {
    const cell = corners[index];
    if (cell === undefined) throw new Error(`hex corner ${String(index)} missing`);
    return cell;
  };
  if (n === 2) return [at(0), at(3)];
  if (n === 3) return [at(0), at(2), at(4)];
  if (n === 4) return [at(0), at(1), at(3), at(4)];
  if (n === 6) return corners;
  return equalSpanHomes(n, D);
};

const PLAYER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const mintPlayers = (count: number): readonly PlayerId[] => {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.trunc(count)));
  return PLAYER_LABELS.slice(0, n).map((label) => mintPlayerId(label));
};

const orderedBordersOf = (vertex: VertexId): readonly ArrowId[] =>
  vertexBorders(vertexCell(vertex))
    .map((c) => cellArrow(c.i, c.j, c.d))
    .toSorted((a, b) => compareIds(String(a), String(b)));

const garrison = (owner: PlayerId, arrow: ArrowId): readonly [ArrowId, Group] => [
  arrow,
  { owner, heads: 3, spent: 0 },
];

/**
 * Build the opening position on the generated tiling.
 *
 * - Homes on a hexagon of radius `homeOffset` (see {@link homeCellsFor}).
 * - Each home: 3-arrow pinwheel + 3-stack (§8).
 * - Spawners on every vertex within graph distance *R* of the origin, force
 *   `1/3^r` (P09 PoC gradient).
 */
export const makeMatch = (config: MatchConfig = DEFAULT_MATCH_CONFIG): GameState => {
  const geometry = makeTiling();
  const players = mintPlayers(config.playerCount);
  const homes = homeCellsFor(players.length, config.homeOffset);
  if (homes.length !== players.length) {
    throw new Error('setup: home count does not match player count');
  }

  const territory = new Map<ArrowId, PlayerId>();
  const groups = new Map<ArrowId, Group>();
  const homeVertices: VertexId[] = [];

  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    const home = homes[i];
    if (player === undefined || home === undefined) {
      throw new Error('setup: missing player or home');
    }
    const vertex = cellVertex(home.i, home.j, 'up');
    homeVertices.push(vertex);
    const borders = orderedBordersOf(vertex);
    const tip = borders[0];
    if (tip === undefined) throw new Error('setup: home pinwheel has no border arrows');
    for (const arrow of borders) territory.set(arrow, player);
    groups.set(tip, garrison(player, tip)[1]);
  }

  const spawners = new Map<VertexId, Spawner>();
  const win = geometry.window(geometry.seedPoint(), config.R + 1);
  for (const vertex of [...win.vertices].toSorted((a, b) => compareIds(String(a), String(b)))) {
    const r = Math.max(1, Math.round(cellDistance(vertexCell(vertex))));
    if (r > config.R) continue;
    const { num, den } = forceAtRadius(r, config.R);
    spawners.set(vertex, { force: rational(num, den), phase: 0 });
  }
  for (let i = 0; i < homeVertices.length; i += 1) {
    const vertex = homeVertices[i];
    const home = homes[i];
    if (vertex === undefined || home === undefined) continue;
    const r = Math.max(1, Math.min(config.R, Math.round(cellDistance(home))));
    const { num, den } = forceAtRadius(r, config.R);
    spawners.set(vertex, { force: rational(num, den), phase: 0 });
  }

  const first = players[0];
  if (first === undefined) throw new Error('setup: no players');

  return {
    players,
    activePlayer: first,
    groups,
    trails: new Map(),
    territory,
    accumulators: new Map(),
    spawners,
    dominationStreak: 0,
    dominationHolder: undefined,
    dominationN: config.dominationN,
    winner: undefined,
  };
};

/** Re-export for callers that only need the reflection helpers. */
export { cellPoint, pointCell };
