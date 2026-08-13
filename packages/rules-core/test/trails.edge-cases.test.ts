/**
 * docs/spec/trails/trails.edge-cases.feature — one test per scenario.
 *
 * P22 beta inverted the branch-toll and size-1-freeze scenarios: joins/splits are
 * free and dormant marks are legal. Grade / purity / overlap scenarios are unchanged.
 *
 * Historical P13 D2–D4 Gherkin in docs/spec/trails/ remains as archive; live
 * expectations for branching live in docs/spec/trails-simple/.
 *
 * @see docs/spec/trails-simple/trails-simple.md
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, step } from '@conquarrow/contracts';
import {
  A,
  B,
  anArrow,
  anExitFrom,
  arrowAt,
  isTrail,
  onBoard,
  pathFrom,
  pick,
  slotsAt,
  stateOf,
  territoryOf,
  trailOf,
} from './support';

/** A point carrying a join of A's trail: two trail in-arrows, one trail out-arrow. */
const aJoin = (
  table: ReturnType<typeof onBoard>,
): {
  readonly paying: ReturnType<typeof anArrow>;
  readonly other: ReturnType<typeof anArrow>;
  readonly onward: ReturnType<typeof anArrow>;
  readonly trail: readonly ReturnType<typeof anArrow>[];
} => {
  const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
  const paying = pick(ins, 1);
  const other = pick(ins, 0);
  const onward = pick(outs, 0);
  return { paying, other, onward, trail: [other, paying, onward] };
};

// ── Rule: branching is free (P22) ────────────────────────────────────────────

describe('branching is free — vacating a join or split is legal (P22)', () => {
  it('lets a step walk the last head off a branch anchor', () => {
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const before = stateOf([{ arrow: paying, owner: A, heads: 1 }], A, { trail: { A: trail } });

    const after = table.rules.apply(
      before,
      step(paying, anExitFrom(table.geometry, paying), 1),
    );

    expect(after.groups.get(paying)).toBeUndefined();
    expect(isTrail(after, A, paying)).toBe(true);
  });

  it('permits stepping away from an anchor while leaving a head on it', () => {
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const before = stateOf([{ arrow: paying, owner: A, heads: 2 }], A, { trail: { A: trail } });

    const after = table.rules.apply(
      before,
      step(paying, anExitFrom(table.geometry, paying), 1),
    );

    expect(after.groups.get(paying)?.heads).toBe(1);
  });

  it('does not freeze the board when a branch is already unanchored', () => {
    const table = onBoard();
    const { onward, trail } = aJoin(table);
    const elsewhere = pathFrom(table.geometry, onward, 2);
    const from = arrowAt(elsewhere, 0);
    const to = arrowAt(elsewhere, 1);
    const before = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      trail: { A: trail },
    });

    const after = table.rules.apply(before, step(from, to, 1));

    expect(after.groups.get(to)?.heads).toBe(1);
  });

  it('does not charge a move for a branch it does not touch', () => {
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const elsewhere = pathFrom(table.geometry, anExitFrom(table.geometry, paying), 2);
    const from = arrowAt(elsewhere, 0);
    const to = arrowAt(elsewhere, 1);
    const before = stateOf(
      [
        { arrow: paying, owner: A, heads: 1 },
        { arrow: from, owner: A, heads: 1 },
      ],
      A,
      { trail: { A: [...trail, from] } },
    );

    const after = table.rules.apply(before, step(from, to, 1));

    expect(after.groups.get(paying)?.heads).toBe(1);
    expect(after.groups.get(to)?.heads).toBe(1);
  });

  it('lets a singleton leave a territory-rooted home fork', () => {
    const table = onBoard();
    const spine = anArrow(table.geometry);
    const root = table.geometry.origin(spine);
    const outs = table.geometry.outArrows(root);
    const armA = pick(outs, 0);
    const armB = pick(outs, 1);
    const feeder = pick(table.geometry.inArrows(root), 0);
    const before = stateOf([{ arrow: armB, owner: A, heads: 1 }], A, {
      trail: { A: [armA, armB] },
      territory: [{ arrow: feeder, owner: A }],
    });

    const after = table.rules.apply(before, step(armB, anExitFrom(table.geometry, armB), 1));

    expect(after.groups.get(armB)).toBeUndefined();
    expect([...after.groups.values()].some((g) => g.owner === A && g.heads === 1)).toBe(true);
  });

  it('lets a singleton strip a mid-trail split with no territory root', () => {
    // P22: mid-trail splits are free — no toll.
    const table = onBoard();
    const spine = anArrow(table.geometry);
    const root = table.geometry.origin(spine);
    const outs = table.geometry.outArrows(root);
    const armA = pick(outs, 0);
    const armB = pick(outs, 1);
    const before = stateOf([{ arrow: armB, owner: A, heads: 1 }], A, {
      trail: { A: [armA, armB] },
    });

    const after = table.rules.apply(before, step(armB, anExitFrom(table.geometry, armB), 1));

    expect(after.groups.get(armB)).toBeUndefined();
    expect(isTrail(after, A, armA)).toBe(true);
    expect(isTrail(after, A, armB)).toBe(true);
  });
});

// ── Rule: a lone head may branch (P22) ───────────────────────────────────────

describe('a lone head may branch (P22)', () => {
  const branches = [
    { label: 'a join — a second trail in-arrow', crossover: false },
    { label: 'a crossover — a join and a split at once', crossover: true },
  ] as const;

  it.each(branches)('lets a lone head form $label', ({ crossover }) => {
    const table = onBoard();
    const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
    const arriving = pick(ins, 1);
    const marked = crossover
      ? [pick(ins, 0), pick(outs, 0), arriving]
      : [pick(ins, 0), arriving];
    const away = pick(outs, crossover ? 1 : 0);
    const before = stateOf([{ arrow: arriving, owner: A, heads: 1 }], A, {
      trail: { A: marked },
    });

    const after = table.rules.apply(before, step(arriving, away, 1));

    expect(after.groups.get(arriving)).toBeUndefined();
    expect(after.groups.get(away)?.heads).toBe(1);
    expect(isTrail(after, A, arriving)).toBe(true);
  });

  it('lets a lone head lay ordinary linear trail', () => {
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const n1 = arrowAt(path, 0);
    const n2 = arrowAt(path, 1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, { trail: { A: [n1] } });

    const after = table.rules.apply(before, step(n1, n2, 1));

    expect(isTrail(after, A, n2)).toBe(true);
  });

  it('lets a pair cross over without leaving an anchor', () => {
    // P22: whole-stack crossover is legal.
    const table = onBoard();
    const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
    const arriving = pick(ins, 1);
    const secondArm = pick(outs, 1);
    const before = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
      trail: { A: [pick(ins, 0), pick(outs, 0), arriving] },
    });

    const after = table.rules.apply(before, step(arriving, secondArm, 2));

    expect(after.groups.get(arriving)).toBeUndefined();
    expect(after.groups.get(secondArm)?.heads).toBe(2);
  });
});

// ── Rule: two players' trails may share an arrow ─────────────────────────────

describe('two players’ trails may share an arrow', () => {
  it('cuts the enemy trail when a head steps onto it', () => {
    // P12: landing on an enemy trail arrow is coincide (§2). The mover marks the
    // landing; the victim evaporates. Dual-mark was P05's stand-in until cuts existed.
    const table = onBoard();
    const n1 = anArrow(table.geometry);
    const x1 = anExitFrom(table.geometry, n1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, {
      trail: { A: [n1], B: [x1] },
    });

    const after = table.rules.apply(before, step(n1, x1, 1));

    expect(isTrail(after, A, x1)).toBe(true);
    expect(isTrail(after, B, x1)).toBe(false);
  });

  it('resolves combat when stepping onto an arrow the enemy occupies', () => {
    // "An arrow in two trails is still one arrow of occupancy". Contact is
    // combat (P06 §6.2) — stay-behind required; 1v1 lands with count 1 of 2.
    const table = onBoard();
    const n1 = anArrow(table.geometry);
    const x1 = anExitFrom(table.geometry, n1);
    const before = stateOf(
      [
        { arrow: n1, owner: B, heads: 2 },
        { arrow: x1, owner: A, heads: 1 },
      ],
      B,
      { trail: { A: [x1], B: [n1, x1] } },
    );

    const after = table.rules.apply(before, step(n1, x1, 1));
    expect(after.groups.get(x1)?.owner).toBe(B);
    expect(after.groups.get(x1)?.heads).toBe(1);
    expect(after.groups.get(n1)?.heads).toBe(1);
  });
});

// ── Rule: marking is idempotent and order-free ───────────────────────────────

describe('trail marking is idempotent and order-free', () => {
  it('is not an error to mark an arrow already in your trail', () => {
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const n1 = arrowAt(path, 0);
    const n2 = arrowAt(path, 1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, {
      trail: { A: [n1, n2] },
    });

    const after = table.rules.apply(before, step(n1, n2, 1));

    expect(trailOf(after, A)).toEqual([n1, n2].map(String).toSorted());
    expect(trailOf(after, A).length).toBe(2);
  });

  it('never makes an arrow both your territory and your trail', () => {
    // "Territory is never also your own trail". The safety rule's one test — an
    // arrow cannot be both safe and exposed for the same player.
    const table = onBoard();
    const n1 = anArrow(table.geometry);
    const t1 = anExitFrom(table.geometry, n1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, {
      trail: { A: [n1] },
      territory: [{ arrow: t1, owner: A }],
    });

    const after = table.rules.apply(before, step(n1, t1, 1));

    expect(isTrail(after, A, t1)).toBe(false);
    expect(territoryOf(after, t1)).toBe(A);
  });
});

// ── Rule: grade degeneracies ─────────────────────────────────────────────────

describe('grade degeneracies', () => {
  it('reports grades per stretch, not per player', () => {
    // "A trail touching your territory and a fragment touching only a stack". A
    // player may hold both grades at once, and §6.1's cut-depth rule is built on
    // exactly that: a deep cut demotes what lies beyond it without destroying it.
    const table = onBoard();
    const t1 = anArrow(table.geometry);
    const anchored = pathFrom(table.geometry, anExitFrom(table.geometry, t1), 2);
    const loose = pathFrom(table.geometry, anArrow(table.geometry), 4, [
      t1,
      arrowAt(anchored, 0),
      arrowAt(anchored, 1),
    ]);
    const far = arrowAt(loose, 3);
    const state = stateOf([{ arrow: arrowAt(loose, 2), owner: A, heads: 1 }], A, {
      trail: { A: [arrowAt(anchored, 0), arrowAt(anchored, 1), arrowAt(loose, 2), far] },
      territory: [{ arrow: t1, owner: A }],
    });

    expect(table.rules.anchorGrade(state, arrowAt(anchored, 1), A)).toBe('territory');
    expect(table.rules.anchorGrade(state, far, A)).toBe('stack');
  });

  it('promotes a fragment when a fresh path from home reaches it', () => {
    // "Re-attaching a fragment promotes it" (§6.1): a demoted fragment is a wall
    // waiting for a road. No special machinery — the ordinary reachability question
    // answers it.
    const table = onBoard();
    const t1 = anArrow(table.geometry);
    const path = pathFrom(table.geometry, anExitFrom(table.geometry, t1), 3);
    const fragment = [arrowAt(path, 1), arrowAt(path, 2)];
    const detached = stateOf([{ arrow: arrowAt(path, 2), owner: A, heads: 1 }], A, {
      trail: { A: fragment },
      territory: [{ arrow: t1, owner: A }],
    });
    expect(table.rules.anchorGrade(detached, arrowAt(path, 2), A)).toBe('stack');

    const reattached = stateOf([{ arrow: arrowAt(path, 2), owner: A, heads: 1 }], A, {
      trail: { A: [arrowAt(path, 0), ...fragment] },
      territory: [{ arrow: t1, owner: A }],
    });

    expect(table.rules.anchorGrade(reattached, arrowAt(path, 2), A)).toBe('territory');
  });

  it('does not let an enemy stack anchor your trail', () => {
    // "An enemy stack standing on your trail does not anchor it". A grade is about
    // whose heads and whose territory — an enemy on your trail is a problem, not an
    // anchor.
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 3);
    const state = stateOf([{ arrow: arrowAt(path, 1), owner: B, heads: 2 }], A, {
      trail: { A: [arrowAt(path, 0), arrowAt(path, 1), arrowAt(path, 2)] },
    });

    expect(table.rules.anchorGrade(state, arrowAt(path, 2), A)).toBe('dormant');
  });

  it('refuses a grade for an arrow that is not in that player’s trail', () => {
    // A grade is a question about trail. Asking it of bare ground is a caller bug,
    // and answering "dormant" would hide it (P05 D9's discipline, P04 D9's rule).
    const table = onBoard();
    const state = stateOf([], A, {});

    expect(() => table.rules.anchorGrade(state, anArrow(table.geometry), A)).toThrow(
      ContractViolation,
    );
  });
});

// ── Rule: apply is pure ──────────────────────────────────────────────────────

describe('marking trail is pure', () => {
  it('does not mutate the input state’s trail set', () => {
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const n1 = arrowAt(path, 0);
    const n2 = arrowAt(path, 1);
    const s0 = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, { trail: { A: [n1] } });
    const before = trailOf(s0, A);

    const s1 = table.rules.apply(s0, step(n1, n2, 1));

    expect(trailOf(s0, A)).toEqual(before);
    expect(isTrail(s1, A, n2)).toBe(true);
  });

  it('returns equal trail sets from equal inputs, in the same order', () => {
    // ADR 0001: a trail is a Set, and an ordered answer derived from one is exactly
    // where insertion order hides. It passes every example above and surfaces only
    // as replay drift.
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const forwards = stateOf([{ arrow: paying, owner: A, heads: 2 }], A, { trail: { A: trail } });
    const backwards = stateOf([{ arrow: paying, owner: A, heads: 2 }], A, {
      trail: { A: [...trail].reverse() },
    });
    const move = step(paying, anExitFrom(table.geometry, paying), 1);

    expect([...(table.rules.apply(backwards, move).trails.get(A) ?? [])].map(String)).toEqual(
      [...(table.rules.apply(forwards, move).trails.get(A) ?? [])].map(String),
    );
  });
});
