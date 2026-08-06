/**
 * docs/spec/encirclement/encirclement.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/encirclement/encirclement.md
 */

import { describe, expect, it } from 'vitest';
import { skip, step } from '@arrows/contracts';
import {
  A,
  B,
  aRunFromHome,
  anExitFrom,
  anArrow,
  arrowAt,
  headsOn,
  onBoard,
  onTiling,
  owned,
  ownerOf,
  snapshot,
  stateOf,
  trailOf,
} from './support';

const totalHeads = (state: ReturnType<typeof stateOf>): number =>
  [...state.groups.values()].reduce((sum, g) => sum + g.heads, 0);

// ── Rule: neutral stranded is not capture ────────────────────────────────────

describe('neutral stranded is not capture', () => {
  it('does not convert a stack-grade fragment on neutral ground', () => {
    const table = onBoard();
    const tip = anArrow(table.geometry);
    const stem = anExitFrom(table.geometry, tip);
    const mover = anExitFrom(table.geometry, stem);
    const before = stateOf(
      [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { B: [tip, stem] },
        territory: [{ arrow: mover, owner: A }],
      },
    );
    expect(table.rules.anchorGrade(before, tip, B)).toBe('stack');

    const exit = anExitFrom(table.geometry, mover);
    const after = table.rules.apply(before, step(mover, exit, 1));

    expect(ownerOf(after, tip)).toBe(B);
  });

  it('never converts a stack on its own territory', () => {
    const table = onBoard();
    const home = anArrow(table.geometry);
    const mover = anExitFrom(table.geometry, home);
    const before = stateOf(
      [
        { arrow: home, owner: B, heads: 2 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        territory: [
          { arrow: home, owner: B },
          { arrow: mover, owner: A },
        ],
      },
    );

    const exit = anExitFrom(table.geometry, mover);
    const after = table.rules.apply(before, step(mover, exit, 1));

    expect(ownerOf(after, home)).toBe(B);
    expect(headsOn(after, home)).toBe(2);
  });
});

// ── Rule: conversion does not strip trail ────────────────────────────────────

describe('conversion does not strip trail', () => {
  it('leaves victim trail arrows outside the converted stack alone', () => {
    const table = onBoard();
    const tip = anArrow(table.geometry);
    const stem = anExitFrom(table.geometry, tip);
    const mover = anExitFrom(table.geometry, stem);
    const before = stateOf(
      [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        trail: { B: [tip, stem] },
        territory: [
          { arrow: tip, owner: A },
          { arrow: mover, owner: A },
        ],
      },
    );

    const exit = anExitFrom(table.geometry, mover);
    const after = table.rules.apply(before, step(mover, exit, 1));

    expect(ownerOf(after, tip)).toBe(A);
    // Conversion left B's trail set intact (stem still marked for B).
    expect(trailOf(after, B)).toEqual(expect.arrayContaining([String(stem), String(tip)].map(String)));
    // Compare via isTrail-style: stem still in B's trail.
    expect(after.trails.get(B)?.has(stem)).toBe(true);
    expect(after.trails.get(B)?.has(tip)).toBe(true);
  });
});

// ── Rule: head conservation and purity ───────────────────────────────────────

describe('head conservation and purity', () => {
  it('conserves total heads when conversion alone changes ownership', () => {
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const before = stateOf(
      [
        { arrow: last, owner: A, heads: 1 },
        { arrow: occupied, owner: B, heads: 3 },
      ],
      A,
      { trail: { A: [...run] }, territory: owned([home, landing], A) },
    );
    const headsBefore = totalHeads(before);

    const after = table.rules.apply(before, step(last, landing, 1));

    expect(totalHeads(after)).toBe(headsBefore);
  });

  it('does not mutate the input state', () => {
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const s0 = stateOf(
      [
        { arrow: last, owner: A, heads: 1 },
        { arrow: occupied, owner: B, heads: 2 },
      ],
      A,
      { trail: { A: [...run] }, territory: owned([home, landing], A) },
    );
    const before = snapshot(s0);

    const s1 = table.rules.apply(s0, step(last, landing, 1));

    expect(snapshot(s0)).toEqual(before);
    expect(snapshot(s1)).not.toEqual(before);
  });

  it('yields equal outcomes from equal inputs', () => {
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const state = stateOf(
      [
        { arrow: last, owner: A, heads: 1 },
        { arrow: occupied, owner: B, heads: 2 },
      ],
      A,
      { trail: { A: [...run] }, territory: owned([home, landing], A) },
    );
    const move = step(last, landing, 1);

    expect(snapshot(table.rules.apply(state, move))).toEqual(
      snapshot(table.rules.apply(state, move)),
    );
  });
});

// ── Rule: order and seams ────────────────────────────────────────────────────

describe('order and seams', () => {
  it('converts on the P05b claimed-arrow seam', () => {
    const table = onTiling();
    const { home, run } = aRunFromHome(table.geometry, 3);
    const occupied = arrowAt(run, 0);
    const last = arrowAt(run, 2);
    const landing = anExitFrom(table.geometry, last);
    const before = stateOf(
      [
        { arrow: last, owner: A, heads: 1 },
        { arrow: occupied, owner: B, heads: 2 },
      ],
      A,
      { trail: { A: [...run] }, territory: owned([home, landing], A) },
    );

    const after = table.rules.apply(before, step(last, landing, 1));

    expect(ownerOf(after, occupied)).toBe(A);
    expect(headsOn(after, occupied)).toBe(2);
  });

  it('does not convert on skip alone', () => {
    const table = onBoard();
    const tip = anArrow(table.geometry);
    const mover = anExitFrom(table.geometry, tip);
    const before = stateOf(
      [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: mover, owner: A, heads: 1 },
      ],
      A,
      {
        territory: [
          { arrow: tip, owner: A },
          { arrow: mover, owner: A },
        ],
      },
    );

    const after = table.rules.apply(before, skip(mover));

    expect(snapshot(after)).toEqual(snapshot(before));
    expect(ownerOf(after, tip)).toBe(B);
  });
});
