/**
 * Match setup for the generated tiling — reflection homes, radial spawners, PoC
 * defaults (P09 / §7 / §8).
 *
 * Lives here rather than in rules-core because placement needs lattice
 * coordinates; the core must not import them.
 */

import {
  DEFAULT_MATCH_CONFIG,
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

const A: PlayerId = mintPlayerId('A');
const B: PlayerId = mintPlayerId('B');

/** Grain-preserving reflection `(i,j) ↦ (i+j, −j)` (§2). */
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
 * - Homes at `(homeOffset, 2)` and its reflection, each a 3-arrow pinwheel +
 *   3-stack (§8).
 * - Spawners on every vertex within graph distance *R* of the origin, force
 *   `1/3^r` (P09 PoC gradient).
 */
export const makeMatch = (config: MatchConfig = DEFAULT_MATCH_CONFIG): GameState => {
  const geometry = makeTiling();
  const homeA: Cell = { i: config.homeOffset, j: 2 };
  const homeB = reflectCell(homeA);

  const vertexA = cellVertex(homeA.i, homeA.j, 'up');
  const vertexB = cellVertex(homeB.i, homeB.j, 'up');
  const bordersA = orderedBordersOf(vertexA);
  const bordersB = orderedBordersOf(vertexB);
  const tipA = bordersA[0];
  const tipB = bordersB[0];
  if (tipA === undefined || tipB === undefined) {
    throw new Error('setup: home pinwheel has no border arrows');
  }

  const territory = new Map<ArrowId, PlayerId>();
  for (const arrow of bordersA) territory.set(arrow, A);
  for (const arrow of bordersB) territory.set(arrow, B);

  const groups = new Map<ArrowId, Group>([garrison(A, tipA), garrison(B, tipB)]);

  const spawners = new Map<VertexId, Spawner>();
  const win = geometry.window(geometry.seedPoint(), config.R + 1);
  for (const vertex of [...win.vertices].toSorted((a, b) => compareIds(String(a), String(b)))) {
    const r = Math.max(1, Math.round(cellDistance(vertexCell(vertex))));
    if (r > config.R) continue;
    const { num, den } = forceAtRadius(r, config.R);
    spawners.set(vertex, { force: rational(num, den), phase: 0 });
  }
  // Homes always carry their spawner (may already be inside the disc).
  for (const [vertex, rHint] of [
    [vertexA, cellDistance(homeA)] as const,
    [vertexB, cellDistance(homeB)] as const,
  ]) {
    const r = Math.max(1, Math.min(config.R, Math.round(rHint)));
    const { num, den } = forceAtRadius(r, config.R);
    spawners.set(vertex, { force: rational(num, den), phase: 0 });
  }

  return {
    players: [A, B],
    activePlayer: A,
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
