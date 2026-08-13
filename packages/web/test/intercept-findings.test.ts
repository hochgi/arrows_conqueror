/**
 * P23 intercept findings — one component test per Gherkin scenario + EARS properties.
 *
 * @see docs/spec/intercept-findings/intercept-findings.core.feature
 * @see docs/spec/intercept-findings/intercept-findings.edge-cases.feature
 */

import { describe, expect, it, vi } from 'vitest';
import { rational, speed } from '@conquarrow/contracts';
import type {
  ArrowId,
  GameState,
  PlayerId,
  PointId,
  StepMove,
} from '@conquarrow/contracts';
import { makeLayout, makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import {
  bestFindingMove,
  collectFindings,
  forceInsideTriangle,
  grainDistance,
  interceptReward,
  type Finding,
  type FindingsLayout,
} from '../src/findings';
import { chooseMove, distanceToTerritory, isCutMove } from '../src/opponent';
import { playLayout } from '../src/playLayout';

const geometry = makeTiling();
const rules = makeRules(geometry);
const layout = makeLayout();

const MATCH = {
  playerCount: 2,
  homeOffset: 5,
  R: 7,
  dominationN: 5,
  spawnerSeed: 1,
} as const;

/** Territory-grade E trail of length 4 (probed against this seed). */
const E_TRAIL_4 = [
  'tiling:a:0,5,1',
  'tiling:a:-1,6,0',
  'tiling:a:0,6,0',
  'tiling:a:1,6,0',
] as unknown as ArrowId[];

/** Interleaving cut: from this arrow onto the trail (not an immediate approach). */
const CUTTER = 'tiling:a:1,5,1' as ArrowId;
const CUT_EXIT = 'tiling:a:0,6,0' as ArrowId;
/**
 * Off-trail arrow from which a step onto the trail's first out (stub at home)
 * cuts by §2 coincide. The in-time / too-late race is toward this, not CUTTER —
 * landing on a trail arrow is a cut even when the trail presents no chord there.
 */
const STUB_CUTTER = 'tiling:a:-1,5,0' as ArrowId;
/** Two grain steps from STUB_CUTTER; stepping here is not itself a cut. */
const APPROACH_FROM = 'tiling:a:-3,5,0' as ArrowId;
/** Five grain steps from STUB_CUTTER — in-window but too late vs enemyETA=4. */
const LATE_FROM = 'tiling:a:-6,5,0' as ArrowId;

const seats = (opening: GameState): { E: PlayerId; Bot: PlayerId } => {
  const E = opening.players[0];
  const Bot = opening.players[1];
  if (E === undefined || Bot === undefined) {
    throw new Error('setup: expected two players');
  }
  return { E, Bot };
};

const tipOf = (trail: readonly ArrowId[]): ArrowId => {
  const tip = trail[trail.length - 1];
  if (tip === undefined) throw new Error('setup: empty trail');
  return tip;
};

/** Enemy tip on a territory-grade trail; Bot stack on `botFrom`. */
const stateWithEnemyTrail = (
  opening: GameState,
  trail: readonly ArrowId[],
  botFrom: ArrowId,
  opts?: {
    readonly tipHeads?: number;
    readonly botHeads?: number;
    readonly stackGrade?: boolean;
  },
): { state: GameState; E: PlayerId; Bot: PlayerId; tip: ArrowId } => {
  const { E, Bot } = seats(opening);
  const tip = tipOf(trail);
  const tipHeads = opts?.tipHeads ?? 1;
  const botHeads = opts?.botHeads ?? 1;

  let territory = opening.territory;
  if (opts?.stackGrade === true) {
    // Strip E's territory so the trail cannot depart home → stack-grade.
    territory = new Map(
      [...opening.territory.entries()].filter(([, owner]) => owner !== E),
    );
  }

  const state: GameState = {
    ...opening,
    activePlayer: Bot,
    territory,
    groups: new Map([
      [botFrom, { owner: Bot, heads: botHeads, spent: 0 }],
      [tip, { owner: E, heads: tipHeads, spent: 0 }],
    ]),
    trails: new Map([[E, new Set(trail)]]),
  };
  return { state, E, Bot, tip };
};

const interceptsOf = (findings: readonly Finding[]): Finding[] =>
  findings.filter((f) => f.kind === 'intercept');

const ceilDiv = (num: number, den: number): number => Math.ceil(num / den);

const expectedReward = (x: number, n: number): number => {
  const raw = Math.round((160 * x) / Math.max(1, n));
  return Math.min(105, Math.max(25, raw));
};

const flatLayout = (): FindingsLayout => {
  const base = makeLayout();
  return {
    pointPosition: (point) => ({ x: base.pointPosition(point).x, y: 0 }),
    vertexPosition: (vertex) => ({ x: base.vertexPosition(vertex).x, y: 0 }),
  };
};

const barycentricInside = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  p: { x: number; y: number },
): boolean => {
  const area = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): number => p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y);
  const A = area(a, b, c);
  if (Math.abs(A) < 1e-9) return false;
  const a1 = area(p, b, c) / A;
  const a2 = area(a, p, c) / A;
  const a3 = area(a, b, p) / A;
  return a1 > 0 && a2 > 0 && a3 > 0;
};

/** Best tip-frontier triangle force for the authored trail (test oracle for x). */
const bestForceInside = (
  state: GameState,
  tip: ArrowId,
  enemy: PlayerId,
): { x: number; apex: PointId; p0: PointId; p1: PointId } => {
  const apex = geometry.target(tip);
  const apexP = layout.pointPosition(apex);
  const frontier = new Set<PointId>();
  for (const [a, owner] of state.territory) {
    if (owner !== enemy) continue;
    frontier.add(geometry.origin(a));
    frontier.add(geometry.target(a));
  }
  const points = [...frontier].toSorted((a, b) =>
    String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
  );
  const seed0 = points[0];
  const seed1 = points[1];
  if (seed0 === undefined || seed1 === undefined) {
    throw new Error('setup: need at least two frontier points');
  }
  let best = { x: -1, apex, p0: seed0, p1: seed1 };
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const p0 = points[i];
      const p1 = points[j];
      if (p0 === undefined || p1 === undefined) continue;
      const A = layout.pointPosition(p0);
      const B = layout.pointPosition(p1);
      const area = Math.abs(
        A.x * (B.y - apexP.y) + B.x * (apexP.y - A.y) + apexP.x * (A.y - B.y),
      );
      if (area < 1e-6) continue;
      let x = 0;
      for (const [vertex, spawner] of state.spawners) {
        if (barycentricInside(apexP, A, B, layout.vertexPosition(vertex))) {
          x += spawner.force.num / spawner.force.den;
        }
      }
      if (x > best.x) best = { x, apex, p0, p1 };
    }
  }
  if (best.x < 0) throw new Error('setup: no positive-area frontier triangle');
  return best;
};

const grainToCutFrom = (from: ArrowId): number => grainDistance(geometry, from, STUB_CUTTER, 24);

// ── Core scenarios ───────────────────────────────────────────────────────────

describe('intercept findings — core', () => {
  it('x sums force of spawners inside the tip-frontier triangle', () => {
    // Scenario: x sums force of spawners inside the tip-frontier triangle
    const opening = makeMatch(MATCH);
    const { state, E, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    expect(rules.anchorGrade(state, tip, E)).toBe('territory');

    const { x, apex, p0, p1 } = bestForceInside(state, tip, E);
    expect(x).toBeGreaterThan(0);

    // Outside control: a spawner far from the tip should not sit inside.
    const farVertex = [...state.spawners.keys()].find((v) => {
      const pos = layout.vertexPosition(v);
      const A = layout.pointPosition(p0);
      const B = layout.pointPosition(p1);
      const C = layout.pointPosition(apex);
      return !barycentricInside(C, A, B, pos);
    });
    expect(farVertex).toBeDefined();

    const measured = forceInsideTriangle(layout, state, apex, p0, p1);
    expect(measured).toBeCloseTo(x, 10);
    // Outside force is excluded by construction of the oracle; assert helper agrees
    // after the coder lands (same triangle, same sum).
    if (farVertex !== undefined) {
      const withExtra: GameState = {
        ...state,
        spawners: new Map([
          ...state.spawners,
          [farVertex, { force: rational(1, 3), phase: 0 }],
        ]),
      };
      // Replacing force on an outside vertex must not change interior sum.
      expect(forceInsideTriangle(layout, withExtra, apex, p0, p1)).toBeCloseTo(x, 10);
    }
  });

  it('Bot in time emits intercept toward a cut', () => {
    // Scenario: Bot in time emits intercept toward a cut
    const opening = makeMatch(MATCH);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    expect(rules.anchorGrade(state, tip, E)).toBe('territory');
    expect(E_TRAIL_4.length).toBeGreaterThanOrEqual(3);

    const dClose = distanceToTerritory(geometry, state, E, tip);
    const tipHeads = state.groups.get(tip)?.heads ?? 1;
    const enemyETA = ceilDiv(dClose, speed(tipHeads));
    const n = grainToCutFrom(APPROACH_FROM);
    const botETA = ceilDiv(n, speed(1));
    expect(botETA).toBeLessThanOrEqual(enemyETA);
    expect(n).toBeGreaterThan(1); // approach, not an immediate cut

    const { x } = bestForceInside(state, tip, E);
    expect(x).toBeGreaterThan(0);

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    const hits = interceptsOf(findings);
    expect(hits.length).toBeGreaterThan(0);

    const hit = hits[0];
    expect(hit).toBeDefined();
    if (hit === undefined) return;
    const d0 = grainDistance(geometry, hit.move.from, STUB_CUTTER, 24);
    const d1 = grainDistance(geometry, hit.move.exit, STUB_CUTTER, 24);
    expect(d1).toBeLessThan(d0);
    expect(hit.cost).toBe(Math.max(1, n));
    expect(hit.reward).toBe(expectedReward(x, n));
    expect(hit.score).toBe(hit.reward * 100 - hit.cost * 10);

    // Production wiring: playLayout must unlock the same intercept path.
    const viaPlay = collectFindings(
      geometry,
      rules,
      state,
      Bot,
      { maxFindings: 32, distCap: 12 },
      playLayout,
    );
    expect(interceptsOf(viaPlay).length).toBeGreaterThan(0);
    expect(chooseMove(geometry, rules, state, Bot).kind).toBe('step');
  });

  it('Bot too late emits no intercept for that tip', () => {
    // Scenario: Bot too late emits no intercept for that tip
    const opening = makeMatch(MATCH);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, LATE_FROM);

    const dClose = distanceToTerritory(geometry, state, E, tip);
    const enemyETA = ceilDiv(dClose, speed(1));
    const n = grainDistance(geometry, LATE_FROM, STUB_CUTTER, 48);
    const botETA = ceilDiv(n, speed(1));
    expect(n).toBeLessThanOrEqual(12); // still inside default distCap
    expect(botETA).toBeGreaterThan(enemyETA);
    expect(bestForceInside(state, tip, E).x).toBeGreaterThan(0);

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    expect(interceptsOf(findings)).toHaveLength(0);
  });

  it('Immediate cut stays classified as cut', () => {
    // Scenario: Immediate cut stays classified as cut
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, CUTTER);

    const cutMove: StepMove = { kind: 'step', from: CUTTER, exit: CUT_EXIT, count: 1 };
    const after = rules.apply(state, cutMove);
    expect(isCutMove(state, after, Bot)).toBe(true);

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    const forMove = findings.filter(
      (f) => f.move.from === CUTTER && f.move.exit === CUT_EXIT,
    );
    expect(forMove.some((f) => f.kind === 'cut')).toBe(true);
    expect(forMove.some((f) => f.kind === 'intercept')).toBe(false);
  });
});

// ── Edge scenarios ───────────────────────────────────────────────────────────

describe('intercept findings — edge cases', () => {
  it('Stack-grade trails do not get intercept', () => {
    // Scenario: Stack-grade or short trails do not get intercept
    const opening = makeMatch(MATCH);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM, {
      stackGrade: true,
    });
    expect(rules.anchorGrade(state, tip, E)).toBe('stack');

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    expect(interceptsOf(findings)).toHaveLength(0);
  });

  it('Territory-grade trail shorter than 3 does not get intercept', () => {
    // Scenario: Territory-grade trail shorter than 3 does not get intercept
    const opening = makeMatch(MATCH);
    const short = E_TRAIL_4.slice(0, 2);
    expect(short.length).toBe(2);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, short, APPROACH_FROM);
    expect(rules.anchorGrade(state, tip, E)).toBe('territory');

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    expect(interceptsOf(findings)).toHaveLength(0);
  });

  it('Colinear or zero-area frontier pairs are skipped', () => {
    // Scenario: Colinear or zero-area frontier pairs are skipped
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, flatLayout());
    expect(interceptsOf(findings)).toHaveLength(0);
  });

  it('No cut within distCap means no intercept', () => {
    // Scenario: No cut within distCap means no intercept
    const opening = makeMatch(MATCH);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    const n = grainToCutFrom(APPROACH_FROM);
    expect(n).toBeGreaterThan(1);
    expect(bestForceInside(state, tip, E).x).toBeGreaterThan(0);

    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 1, // below n
    }, layout);
    expect(interceptsOf(findings)).toHaveLength(0);
  });

  it('Same state yields the same intercept set', () => {
    // Scenario: Same state yields the same intercept set
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);

    const a = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    const b = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    expect(a).toEqual(b);
    expect(interceptsOf(a).length).toBeGreaterThan(0);
  });

  it.each([
    { x: 0.5, n: 2, note: 'mid ratio' },
    { x: 2, n: 1, note: 'hits high clamp' },
    { x: 0.1, n: 8, note: 'hits low clamp' },
  ])('Reward clamps for x=$x n=$n ($note)', ({ x, n }) => {
    // Scenario Outline: Reward clamps
    const reward = interceptReward(x, n);
    const expected = expectedReward(x, n);
    expect(reward).toBe(expected);
    const cost = Math.max(1, n);
    expect(reward * 100 - cost * 10).toBe(expected * 100 - cost * 10);
  });
});

// ── EARS invariants as properties ────────────────────────────────────────────

describe('intercept findings — EARS invariants', () => {
  it('WHILE collecting, SHALL NOT call Date.now, Math.random, or I/O', () => {
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    const dateNow = vi.spyOn(Date, 'now');
    const random = vi.spyOn(Math, 'random');

    collectFindings(geometry, rules, state, Bot, { maxFindings: 32, distCap: 12 }, layout);

    expect(dateNow).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    dateNow.mockRestore();
    random.mockRestore();
  });

  it('WHEN botETA > enemyETA, SHALL NOT emit intercept for that tip', () => {
    const opening = makeMatch(MATCH);
    const { state, E, Bot, tip } = stateWithEnemyTrail(opening, E_TRAIL_4, LATE_FROM);
    const enemyETA = ceilDiv(distanceToTerritory(geometry, state, E, tip), speed(1));
    const botETA = ceilDiv(grainDistance(geometry, LATE_FROM, STUB_CUTTER, 48), speed(1));
    expect(botETA).toBeGreaterThan(enemyETA);

    expect(
      interceptsOf(
        collectFindings(geometry, rules, state, Bot, { maxFindings: 32, distCap: 12 }, layout),
      ),
    ).toHaveLength(0);
  });

  it('WHEN a step shrinks enemy trail this ply, SHALL emit cut not intercept', () => {
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, CUTTER);
    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    for (const f of findings) {
      const after = rules.apply(state, f.move);
      if (!isCutMove(state, after, Bot)) continue;
      expect(f.kind).toBe('cut');
      expect(f.kind).not.toBe('intercept');
    }
    expect(findings.some((f) => f.kind === 'cut')).toBe(true);
  });

  it('WHEN intercept is emitted, score SHALL equal reward*100 - cost*10 with cost=max(1,n)', () => {
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    const hits = interceptsOf(findings);
    expect(hits.length).toBeGreaterThan(0);
    for (const f of hits) {
      expect(f.cost).toBeGreaterThanOrEqual(1);
      expect(f.score).toBe(f.reward * 100 - f.cost * 10);
    }
  });

  it('WHILE choosing kinds, SHALL prefer cut over intercept over attack', () => {
    // Priority list contract (bestFindingMove) — cut before intercept before attack.
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, CUTTER);
    const move = bestFindingMove(
      geometry,
      rules,
      state,
      Bot,
      { maxFindings: 32, distCap: 12 },
      layout,
    );
    expect(move).toBeDefined();
    // With an immediate cut available, the preferred kind must be cut (not intercept/attack).
    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    const preferred = findings.find(
      (f) => f.kind === 'cut' || f.kind === 'intercept' || f.kind === 'attack',
    );
    expect(preferred?.kind).toBe('cut');
  });

  it('WHEN two findings tie on score, SHALL prefer the lesser move key', () => {
    // Schedule unit: equal reward/cost → equal score; sort key is move key.
    const rLow = interceptReward(0.5, 2);
    const rHigh = interceptReward(0.5, 2);
    expect(rLow).toBe(rHigh);
    // Integration: collected list is sorted descending score then ascending move key.
    const opening = makeMatch(MATCH);
    const { state, Bot } = stateWithEnemyTrail(opening, E_TRAIL_4, APPROACH_FROM);
    const findings = collectFindings(geometry, rules, state, Bot, {
      maxFindings: 32,
      distCap: 12,
    }, layout);
    for (let i = 1; i < findings.length; i += 1) {
      const prev = findings[i - 1];
      const cur = findings[i];
      if (prev === undefined || cur === undefined) continue;
      if (prev.score === cur.score) {
        const key = (m: StepMove): string =>
          `step:${String(m.from)}>${String(m.exit)}:${String(m.count)}`;
        expect(key(prev.move) <= key(cur.move)).toBe(true);
      } else {
        expect(prev.score).toBeGreaterThan(cur.score);
      }
    }
  });
});
