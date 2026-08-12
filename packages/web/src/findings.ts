/**
 * Deterministic findings planner — playtest adapter (P21).
 *
 * Not rules-core. Pure: no Date, no Math.random, no I/O. Caps bound work.
 */

import type {
  ArrowId,
  GameState,
  GeometryPort,
  Move,
  PlayerId,
  RulesPort,
  StepMove,
} from '@arrows/contracts';

export type FindingKind =
  | 'claim_share'
  | 'approach_spawner'
  | 'cut'
  | 'close'
  | 'attack'
  | 'merge_pair';

export interface Finding {
  readonly kind: FindingKind;
  readonly from: ArrowId;
  readonly goal: ArrowId;
  readonly cost: number;
  readonly reward: number;
  readonly score: number;
  readonly move: StepMove;
}

export interface FindingsCaps {
  readonly maxFindings: number;
  readonly distCap: number;
}

export const DEFAULT_FINDINGS_CAPS: FindingsCaps = {
  maxFindings: 8,
  distCap: 12,
};

const moveKey = (move: Move): string => {
  switch (move.kind) {
    case 'step':
      return `step:${String(move.from)}>${String(move.exit)}:${String(move.count)}`;
    case 'skip':
      return `skip:${String(move.from)}`;
    case 'endTurn':
      return 'endTurn';
  }
};

const compareFindings = (a: Finding, b: Finding): number => {
  if (a.score !== b.score) return b.score - a.score;
  const ka = moveKey(a.move);
  const kb = moveKey(b.move);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

const scoreOf = (reward: number, cost: number): number => reward * 100 - cost * 10;

const territoryOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const owner of state.territory.values()) if (owner === player) n += 1;
  return n;
};

/** Spawner-border arrows already owned as territory (true shares). */
const shareCountOf = (
  geometry: GeometryPort,
  state: GameState,
  player: PlayerId,
): number => {
  let n = 0;
  for (const vertex of state.spawners.keys()) {
    for (const arrow of geometry.borderArrows(vertex)) {
      if (state.territory.get(arrow) === player) n += 1;
    }
  }
  return n;
};

const isClosingMove = (
  before: GameState,
  after: GameState,
  me: PlayerId,
  move: StepMove,
): boolean => {
  const wasOnTrail = before.trails.get(me)?.has(move.from) ?? false;
  if (!wasOnTrail) return false;
  const landedHome = before.territory.get(move.exit) === me;
  const gained = territoryOf(after, me) > territoryOf(before, me);
  return landedHome || gained;
};

const isCutMove = (before: GameState, after: GameState, me: PlayerId): boolean => {
  for (const [player, set] of before.trails) {
    if (player === me) continue;
    const afterSize = after.trails.get(player)?.size ?? 0;
    if (afterSize < set.size) return true;
  }
  return false;
};

/** Grain BFS distance from start to goal (out-arrows only). */
export const grainDistance = (
  geometry: GeometryPort,
  start: ArrowId,
  goal: ArrowId,
  cap: number,
): number => {
  if (start === goal) return 0;
  const seen = new Set<string>([String(start)]);
  let frontier: ArrowId[] = [start];
  for (let d = 1; d <= cap; d += 1) {
    const next: ArrowId[] = [];
    for (const arrow of frontier) {
      for (const exit of geometry.outArrows(geometry.target(arrow))) {
        const key = String(exit);
        if (seen.has(key)) continue;
        if (exit === goal) return d;
        seen.add(key);
        next.push(exit);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return cap + 1;
};

const openSpawnerBorders = (
  geometry: GeometryPort,
  state: GameState,
): ArrowId[] => {
  const out: ArrowId[] = [];
  const vertices = [...state.spawners.keys()].toSorted((a, b) =>
    String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
  );
  for (const vertex of vertices) {
    const borders = [...geometry.borderArrows(vertex)].toSorted((a, b) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    );
    for (const border of borders) {
      if (state.territory.get(border) === undefined) out.push(border);
    }
  }
  return out;
};

const pickPortion = (heads: number, preferred: number): number => {
  if (heads <= 0) return 1;
  if (preferred <= heads) return preferred;
  // Prefer power-of-two shaped leave/take when possible.
  if (heads >= 2) return 2;
  return 1;
};

/**
 * Ranked findings for `me`. Immediate legal steps only; cost is grain distance
 * to the goal (or 1 for tactical findings on the exit itself).
 */
export const collectFindings = (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  caps: FindingsCaps = DEFAULT_FINDINGS_CAPS,
): readonly Finding[] => {
  const legal = rules.legalMoves(state).filter((m): m is StepMove => m.kind === 'step');
  if (legal.length === 0) return [];

  const byFrom = new Map<string, StepMove[]>();
  for (const m of legal) {
    const key = String(m.from);
    const list = byFrom.get(key) ?? [];
    list.push(m);
    byFrom.set(key, list);
  }

  const openShares = openSpawnerBorders(geometry, state);
  const found: Finding[] = [];
  const seenMove = new Set<string>();

  const push = (finding: Finding): void => {
    const key = moveKey(finding.move);
    if (seenMove.has(key)) return;
    seenMove.add(key);
    found.push(finding);
  };

  for (const move of legal) {
    let after: GameState;
    try {
      after = rules.apply(state, move);
    } catch {
      continue;
    }
    const group = state.groups.get(move.from);
    const heads = group?.heads ?? 1;

    if (isClosingMove(state, after, me, move)) {
      const cost = 1;
      const reward = 90;
      push({
        kind: 'close',
        from: move.from,
        goal: move.exit,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move,
      });
    }
    if (isCutMove(state, after, me)) {
      const cost = 1;
      const reward = 70;
      push({
        kind: 'cut',
        from: move.from,
        goal: move.exit,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move,
      });
    }
    const dest = state.groups.get(move.exit);
    if (dest !== undefined && dest.owner !== me) {
      const cost = 1;
      const reward = 55;
      push({
        kind: 'attack',
        from: move.from,
        goal: move.exit,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move,
      });
    }
    const left = heads - move.count;
    if (move.count === 2 || left === 2) {
      const cost = 1;
      const reward = 25;
      push({
        kind: 'merge_pair',
        from: move.from,
        goal: move.exit,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move,
      });
    }
    // Visiting an unclaimed spawner border is not a claim — only a close that
    // raises share count is. False claim_share bait milled tips on pinwheels.
    if (shareCountOf(geometry, after, me) > shareCountOf(geometry, state, me)) {
      const cost = 1;
      const reward = 100;
      push({
        kind: 'claim_share',
        from: move.from,
        goal: move.exit,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move,
      });
    }
  }

  for (const [, moves] of [...byFrom.entries()].toSorted((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    const from = moves[0]?.from;
    if (from === undefined) continue;
    // Already on an open share: hopping to a sibling border is a pinwheel mill,
    // not progress. Closing / evaluate homeward owns the next decision.
    if (openShares.some((s) => s === from)) continue;
    const group = state.groups.get(from);
    const heads = group?.heads ?? 1;
    const nearestGoals = openShares
      .map((goal) => ({
        goal,
        d: grainDistance(geometry, from, goal, caps.distCap),
      }))
      .filter((g) => g.d > 0 && g.d <= caps.distCap)
      .toSorted((a, b) =>
        a.d !== b.d ? a.d - b.d : String(a.goal) < String(b.goal) ? -1 : 1,
      )
      .slice(0, 3);
    for (const { goal, d: d0 } of nearestGoals) {
      let best: { move: StepMove; d1: number } | undefined;
      for (const m of moves) {
        const d1 = grainDistance(geometry, m.exit, goal, caps.distCap);
        if (d1 >= d0) continue;
        if (
          best === undefined ||
          d1 < best.d1 ||
          (d1 === best.d1 && moveKey(m) < moveKey(best.move))
        ) {
          best = { move: m, d1 };
        }
      }
      if (best === undefined) continue;
      const preferred = pickPortion(heads, best.move.count);
      const adjusted =
        moves.find(
          (m) =>
            m.exit === best.move.exit &&
            m.count === preferred &&
            grainDistance(geometry, m.exit, goal, caps.distCap) < d0,
        ) ?? best.move;
      const cost = Math.max(1, best.d1);
      const reward = 40;
      push({
        kind: 'approach_spawner',
        from,
        goal,
        cost,
        reward,
        score: scoreOf(reward, cost),
        move: adjusted,
      });
    }
  }

  return found.toSorted(compareFindings).slice(0, caps.maxFindings);
};

/** Prefer tactical closes/claims/cuts over long approaches when both exist. */
export const bestFindingMove = (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
  caps: FindingsCaps = DEFAULT_FINDINGS_CAPS,
): StepMove | undefined => {
  const findings = collectFindings(geometry, rules, state, me, caps);
  const priority: readonly FindingKind[] = [
    'close',
    'claim_share',
    'cut',
    'attack',
    'approach_spawner',
    'merge_pair',
  ];
  for (const kind of priority) {
    const hit = findings.find((f) => f.kind === kind);
    if (hit !== undefined) return hit.move;
  }
  return findings[0]?.move;
};
