import { describe, expect, it } from 'vitest';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import { collectFindings } from '../src/findings';
import { chooseMove } from '../src/opponent';

describe('findings planner', () => {
  it('returns capped legal steps sorted by score then move key', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch({
      dominationN: 5,
      R: 7,
      homeOffset: 5,
      playerCount: 3,
      spawnerSeed: 1,
    });
    const B = opening.players[1];
    expect(B).toBeDefined();
    if (B === undefined) return;
    const state = rules.apply(opening, { kind: 'endTurn' });
    expect(state.activePlayer).toBe(B);
    const findings = collectFindings(geometry, rules, state, B, {
      maxFindings: 8,
      distCap: 12,
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.length).toBeLessThanOrEqual(8);
    const legal = new Set(
      rules
        .legalMoves(state)
        .filter((m) => m.kind === 'step')
        .map((m) => `${String(m.from)}>${String(m.exit)}:${String(m.count)}`),
    );
    for (const f of findings) {
      expect(legal.has(`${String(f.move.from)}>${String(f.move.exit)}:${String(f.move.count)}`)).toBe(
        true,
      );
    }
    for (let i = 1; i < findings.length; i += 1) {
      const prev = findings[i - 1];
      const cur = findings[i];
      if (prev === undefined || cur === undefined) continue;
      expect(prev.score).toBeGreaterThanOrEqual(cur.score);
    }
  });

  it('is deterministic on the same state', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const B = opening.players[1];
    expect(B).toBeDefined();
    if (B === undefined) return;
    const state = rules.apply(opening, { kind: 'endTurn' });
    const a = collectFindings(geometry, rules, state, B);
    const b = collectFindings(geometry, rules, state, B);
    expect(a).toEqual(b);
  });

  it('lets chooseMove prefer a finding without passing', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const B = opening.players[1];
    expect(B).toBeDefined();
    if (B === undefined) return;
    const state = rules.apply(opening, { kind: 'endTurn' });
    const hasStep = rules.legalMoves(state).some((m) => m.kind === 'step');
    expect(hasStep).toBe(true);
    expect(chooseMove(geometry, rules, state, B).kind).toBe('step');
  });

  it('does not emit claim_share for visiting an unclaimed border without gaining shares', () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch({
      dominationN: 5,
      R: 7,
      homeOffset: 5,
      playerCount: 3,
      spawnerSeed: 1,
    });
    const B = opening.players[1];
    expect(B).toBeDefined();
    if (B === undefined) return;
    const state = rules.apply(opening, { kind: 'endTurn' });
    const findings = collectFindings(geometry, rules, state, B, {
      maxFindings: 32,
      distCap: 12,
    });
    for (const f of findings) {
      if (f.kind !== 'claim_share') continue;
      const after = rules.apply(state, f.move);
      let beforeShares = 0;
      let afterShares = 0;
      for (const vertex of state.spawners.keys()) {
        for (const arrow of geometry.borderArrows(vertex)) {
          if (state.territory.get(arrow) === B) beforeShares += 1;
          if (after.territory.get(arrow) === B) afterShares += 1;
        }
      }
      expect(afterShares).toBeGreaterThan(beforeShares);
    }
  });
});
