/**
 * Playtest opponent — adapter only, not P12.
 *
 * Lessons from logs (bot never closed, many idle turns with steps available):
 *   1. **Never pass while a legal step exists.** Close-urgency was making every
 *      extension look worse than `endTurn`, so the bot froze with open trail.
 *   2. **Steer by distance-to-territory** (BFS along the grain). Under urgency,
 *      prefer shrinking that distance — the deterministic stand-in for "U-turn
 *      and close".
 *   3. **Tempo / pairs** (§3): prefer `speed(2)` shapes; avoid freezing a lone tip.
 *   4. **Harass**: cut enemy trail, take favorable contact fights.
 *
 * Ties break on a stable move key — never insertion order. No RNG (replayable).
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
import { endTurn, speed } from '@arrows/contracts';

const MAX_CANDIDATES = 64;
const MAX_MOVES_PER_TURN = 64;
const DIST_CAP = 16;

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

const compareMoves = (left: Move, right: Move): number => {
  const a = moveKey(left);
  const b = moveKey(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

const headsOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const group of state.groups.values()) if (group.owner === player) n += group.heads;
  return n;
};

const territoryOf = (state: GameState, player: PlayerId): number => {
  let n = 0;
  for (const owner of state.territory.values()) if (owner === player) n += 1;
  return n;
};

const trailOf = (state: GameState, player: PlayerId): number =>
  state.trails.get(player)?.size ?? 0;

const sharesOf = (
  geometry: GeometryPort,
  state: GameState,
  player: PlayerId,
): number => {
  let n = 0;
  const vertices = [...state.spawners.keys()].toSorted((a, b) =>
    String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
  );
  for (const vertex of vertices) {
    for (const arrow of [...geometry.borderArrows(vertex)].toSorted((a, b) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    )) {
      if (state.territory.get(arrow) === player) n += 1;
    }
  }
  return n;
};

/** Rises with trail length — bias toward returning / claiming, not toward passing. */
export const closeUrgency = (trailLen: number): number => {
  if (trailLen <= 2) return 0;
  return Math.min(100, (trailLen - 2) * 12);
};

/**
 * Shortest path length along out-arrows to an arrow of `me`'s territory.
 * Movement must follow the grain, so this is the real "how far to a close".
 */
export const distanceToTerritory = (
  geometry: GeometryPort,
  state: GameState,
  me: PlayerId,
  start: ArrowId,
  cap = DIST_CAP,
): number => {
  if (state.territory.get(start) === me) return 0;
  const seen = new Set<string>([String(start)]);
  let frontier: ArrowId[] = [start];
  for (let d = 1; d <= cap; d += 1) {
    const next: ArrowId[] = [];
    for (const arrow of frontier) {
      for (const exit of geometry.outArrows(geometry.target(arrow))) {
        const key = String(exit);
        if (seen.has(key)) continue;
        if (state.territory.get(exit) === me) return d;
        seen.add(key);
        next.push(exit);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return cap + 1;
};

const stackShapeScore = (state: GameState, me: PlayerId, rules: RulesPort): number => {
  let score = 0;
  const steppable = new Set<ArrowId>();
  for (const m of rules.legalMoves(state)) {
    if (m.kind === 'step') steppable.add(m.from);
  }
  for (const [arrow, group] of state.groups) {
    if (group.owner !== me) continue;
    if (group.heads === 2) score += 30;
    else if (group.heads === 1) {
      score -= 10;
      const canAct = group.spent < speed(1) && steppable.has(arrow);
      if (!canAct && (state.trails.get(me)?.has(arrow) ?? false)) score -= 60;
    } else if (group.heads === 3) score += 4;
    else if (group.heads >= 4) score += 14;
  }
  return score;
};

export const evaluate = (
  geometry: GeometryPort,
  state: GameState,
  me: PlayerId,
  rules?: RulesPort,
): number => {
  if (state.winner === me) return 1_000_000;
  if (state.winner !== undefined) return -1_000_000;

  let enemyHeads = 0;
  for (const group of state.groups.values()) {
    if (group.owner !== me) enemyHeads += group.heads;
  }

  const territory = territoryOf(state, me);
  let enemyTerritory = 0;
  for (const owner of state.territory.values()) {
    if (owner !== me) enemyTerritory += 1;
  }

  const trail = trailOf(state, me);
  let enemyTrail = 0;
  for (const [player, set] of state.trails) {
    if (player !== me) enemyTrail += set.size;
  }

  const shares = sharesOf(geometry, state, me);
  let enemyShares = 0;
  for (const player of state.players) {
    if (player !== me) enemyShares += sharesOf(geometry, state, player);
  }

  let domination = 0;
  if (state.dominationHolder !== undefined && state.dominationHolder !== me) {
    // Opponent is on the zero-share clock — good for us.
    domination = state.dominationStreak * 200;
  } else if (state.dominationHolder === me) {
    domination = -state.dominationStreak * 200;
  }

  // Tip pressure: how far the furthest of my groups is from a close.
  let tipPressure = 0;
  for (const [arrow, group] of state.groups) {
    if (group.owner !== me) continue;
    if (!(state.trails.get(me)?.has(arrow) ?? false)) continue;
    tipPressure += distanceToTerritory(geometry, state, me, arrow);
  }
  const urgency = closeUrgency(trail);
  const tipTerm = -tipPressure * (4 + Math.floor(urgency / 20));

  const shape = rules === undefined ? 0 : stackShapeScore(state, me, rules);

  return (
    headsOf(state, me) * 120 -
    enemyHeads * 120 +
    territory * 25 -
    enemyTerritory * 18 +
    shares * 100 -
    enemyShares * 90 +
    // Open trail is a cut surface once long — but never so toxic we prefer idling.
    trail * 2 -
    enemyTrail * 6 +
    tipTerm +
    domination +
    shape
  );
};

const strategicCounts = (maxCount: number): readonly number[] => {
  const counts = new Set<number>();
  if (maxCount >= 1) counts.add(maxCount);
  if (maxCount >= 2) {
    counts.add(maxCount - 1);
    counts.add(2);
  }
  if (maxCount >= 3) counts.add(1);
  return [...counts].toSorted((a, b) => a - b);
};

export const pruneCandidates = (moves: readonly Move[]): readonly Move[] => {
  const byExit = new Map<string, StepMove[]>();
  let end: Move | undefined;
  for (const move of moves) {
    if (move.kind === 'endTurn') {
      end = move;
      continue;
    }
    if (move.kind !== 'step') continue;
    const key = `${String(move.from)}>${String(move.exit)}`;
    const list = byExit.get(key) ?? [];
    list.push(move);
    byExit.set(key, list);
  }

  const out: Move[] = [];
  for (const list of byExit.values()) {
    const max = list.reduce((m, s) => Math.max(m, s.count), 0);
    const wanted = new Set(strategicCounts(max));
    for (const move of list) {
      if (wanted.has(move.count)) out.push(move);
    }
  }
  if (end !== undefined) out.push(end);

  const sorted = out.toSorted(compareMoves);
  if (sorted.length <= MAX_CANDIDATES) return sorted;
  const steps = sorted.filter((m): m is StepMove => m.kind === 'step');
  const kept: Move[] = [...steps.slice(0, MAX_CANDIDATES - (end !== undefined ? 1 : 0))];
  if (end !== undefined) kept.push(end);
  return kept.toSorted(compareMoves);
};

const scoreStepExtras = (
  geometry: GeometryPort,
  before: GameState,
  after: GameState,
  move: StepMove,
  me: PlayerId,
): number => {
  let bonus = 0;
  const group = before.groups.get(move.from);
  if (group === undefined) return bonus;

  const leftBehind = group.heads - move.count;
  if (move.count === 2) bonus += 36;
  if (leftBehind === 2) bonus += 28;
  if (move.count === 1 && group.heads >= 3) bonus += 12;
  if (leftBehind === 1 && move.count >= 2) bonus -= 40;

  const dest = before.groups.get(move.exit);
  if (dest !== undefined && dest.owner !== me) {
    bonus += 50 + (move.count - dest.heads) * 40;
    if (move.count < dest.heads) bonus -= 60;
  }

  for (const [player, set] of before.trails) {
    if (player === me) continue;
    if (set.has(move.exit)) bonus += 90;
    const afterSize = after.trails.get(player)?.size ?? 0;
    if (afterSize < set.size) bonus += (set.size - afterSize) * 55;
  }

  const urgency = closeUrgency(trailOf(before, me));
  const onOwnLand = before.territory.get(move.exit) === me;
  const trailing = before.trails.get(me)?.has(move.from) ?? false;
  if (onOwnLand && trailing) bonus += 200 + urgency * 3;

  const gainedTerr = territoryOf(after, me) - territoryOf(before, me);
  if (gainedTerr > 0) bonus += 400 + urgency * 5 + gainedTerr * 30;

  // Homeward bias along the grain.
  const d0 = distanceToTerritory(geometry, before, me, move.from);
  const d1 = distanceToTerritory(geometry, before, me, move.exit);
  if (d1 < d0) bonus += (d0 - d1) * (25 + urgency);
  else if (d1 > d0) {
    if (urgency >= 36) bonus -= (d1 - d0) * (urgency + 10);
    else bonus += 6; // early: allow scouting outward
  }

  if (territoryOf(before, me) <= 6 && leftBehind === 0 && before.territory.get(move.from) === me) {
    bonus -= 25;
  }

  return bonus;
};

export const chooseMove = (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
): Move => {
  const offered = rules.legalMoves(state);
  const pruned = pruneCandidates(offered);
  const steps = pruned.filter((m): m is StepMove => m.kind === 'step');
  // Hard rule from the idle-turn autopsy: never pass while a step is legal.
  const candidates: readonly Move[] =
    steps.length > 0 ? steps : pruned.length > 0 ? pruned : offered;

  const first = candidates[0];
  if (first === undefined) {
    const fallback = offered[offered.length - 1];
    if (fallback === undefined) throw new Error('opponent: no legal moves');
    return fallback;
  }

  let best: Move = first;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of candidates) {
    let next: GameState;
    try {
      next = rules.apply(state, move);
    } catch {
      continue;
    }
    let score = evaluate(geometry, next, me, rules);
    if (move.kind === 'step') {
      score += scoreStepExtras(geometry, state, next, move, me);
    }
    if (score > bestScore || (score === bestScore && compareMoves(move, best) < 0)) {
      bestScore = score;
      best = move;
    }
  }
  return best;
};

export interface BotTurn {
  readonly state: GameState;
  readonly moves: readonly Move[];
}

export const playBotTurn = (
  geometry: GeometryPort,
  rules: RulesPort,
  state: GameState,
  me: PlayerId,
): BotTurn => {
  if (state.activePlayer !== me || state.winner !== undefined) {
    return { state, moves: [] };
  }
  const moves: Move[] = [];
  let at = state;
  for (let i = 0; i < MAX_MOVES_PER_TURN; i += 1) {
    if (at.winner !== undefined || at.activePlayer !== me) break;
    const move = chooseMove(geometry, rules, at, me);
    at = rules.apply(at, move);
    moves.push(move);
  }
  if (at.winner === undefined && at.activePlayer === me) {
    const forced = endTurn();
    at = rules.apply(at, forced);
    moves.push(forced);
  }
  return { state: at, moves };
};
