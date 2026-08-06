/**
 * docs/spec/trails/trails.edge-cases.feature — one test per scenario.
 *
 * The centre of gravity is the branch mandate. §5 states it in one sentence that is
 * grammatically ambiguous about *when* it bites, and two of the three available
 * readings freeze the board the first time damage legally empties a fork. The test
 * that tells them apart is "an already-unanchored branch does not freeze the board",
 * and it is the most load-bearing assertion in the packet.
 *
 * @see docs/spec/trails/trails.md — "The branch-anchor rule, and why the reading matters"
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, step } from '@arrows/contracts';
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

// ── Rule: the mandate is local to the move ───────────────────────────────────

describe('the branch mandate constrains what you may leave', () => {
  it('refuses a step that walks the last head off a branch anchor', () => {
    // "Stepping away from a branch anchor is refused". This is where the split
    // anchor actually bites: arriving paid it, and leaving must not un-pay it.
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const before = stateOf([{ arrow: paying, owner: A, heads: 1 }], A, { trail: { A: trail } });

    expect(() =>
      table.rules.apply(before, step(paying, anExitFrom(table.geometry, paying), 1)),
    ).toThrow(ContractViolation);
  });

  it('names the branch it would have stripped', () => {
    const table = onBoard();
    const { paying, trail } = aJoin(table);
    const before = stateOf([{ arrow: paying, owner: A, heads: 1 }], A, { trail: { A: trail } });

    expect(() =>
      table.rules.apply(before, step(paying, anExitFrom(table.geometry, paying), 1)),
    ).toThrow(new RegExp(String(paying)));
  });

  it('permits stepping away from an anchor while leaving a head on it', () => {
    // "Stepping away from a branch anchor while leaving a head is legal". The price
    // is one head, not immobility.
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
    // **The distinguishing scenario.** §5 and §6.1 both say damage can empty a
    // branch point and that the state is legal — it simply could not have been
    // created deliberately. Under a whole-trail invariant this move would be
    // illegal for a violation it did not cause and cannot repair, and the game
    // would be stuck for the rest of the match.
    const table = onBoard();
    const { onward, trail } = aJoin(table);
    // Downstream of the join, not on either of its in-arrows — the Given the
    // scenario opens with. `anArrow` would *not* do: `aJoin` derives P as its
    // target, so the group would stand on one of the very anchors the previous
    // scenario refuses stepping off, and this would assert the opposite of it.
    const elsewhere = pathFrom(table.geometry, onward, 2);
    const from = arrowAt(elsewhere, 0);
    const to = arrowAt(elsewhere, 1);
    const before = stateOf([{ arrow: from, owner: A, heads: 1 }], A, {
      // The join is authored with no head anywhere on it — exactly what a cut leaves.
      trail: { A: trail },
    });

    const after = table.rules.apply(before, step(from, to, 1));

    expect(after.groups.get(to)?.heads).toBe(1);

    // The contrast is the whole assertion, and it is what keeps this test from
    // passing merely because no mandate exists yet: the *anchored* version of the
    // same board refuses the same shape of move.
    const { paying, trail: anchored } = aJoin(table);
    const guarded = stateOf([{ arrow: paying, owner: A, heads: 1 }], A, {
      trail: { A: anchored },
    });
    expect(() =>
      table.rules.apply(guarded, step(paying, anExitFrom(table.geometry, paying), 1)),
    ).toThrow(ContractViolation);
  });

  it('does not charge a move for a branch it does not touch', () => {
    // "A move elsewhere is not charged for a branch it does not touch". The check is
    // against what the move changes, so a properly anchored branch across the board
    // is simply not the move's business.
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
});

// ── Rule: a lone head is an anchor, not a brancher ───────────────────────────

describe('a lone head is an anchor, not a brancher', () => {
  const branches = [
    { label: 'a join — a second trail in-arrow', crossover: false },
    { label: 'a crossover — a join and a split at once', crossover: true },
  ] as const;

  it.each(branches)('refuses a lone head forming $label', ({ crossover }) => {
    const table = onBoard();
    const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
    const arriving = pick(ins, 1);
    const marked = crossover
      ? [pick(ins, 0), pick(outs, 0), arriving]
      : [pick(ins, 0), arriving];
    const before = stateOf([{ arrow: arriving, owner: A, heads: 1 }], A, {
      trail: { A: marked },
    });

    expect(() =>
      table.rules.apply(before, step(arriving, pick(outs, crossover ? 1 : 0), 1)),
    ).toThrow(ContractViolation);
    expect(before.groups.get(arriving)?.heads).toBe(1);
  });

  it('lets a lone head lay ordinary linear trail', () => {
    // "A lone head may still lay ordinary linear trail". Linear trail carries no
    // heads (§5); the bill is for branching only.
    const table = onBoard();
    const path = pathFrom(table.geometry, anArrow(table.geometry), 2);
    const n1 = arrowAt(path, 0);
    const n2 = arrowAt(path, 1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, { trail: { A: [n1] } });

    const after = table.rules.apply(before, step(n1, n2, 1));

    expect(isTrail(after, A, n2)).toBe(true);
  });

  it('lets a pair cross over, with nothing left to continue', () => {
    // "A pair may cross over, and arrives with nothing left to continue". §5's
    // arithmetic: two heads, two anchors, one each side, and the tip is spent.
    const table = onBoard();
    const { ins, outs } = slotsAt(table.geometry, table.geometry.target(anArrow(table.geometry)));
    const arriving = pick(ins, 1);
    const secondArm = pick(outs, 1);
    const before = stateOf([{ arrow: arriving, owner: A, heads: 2 }], A, {
      trail: { A: [pick(ins, 0), pick(outs, 0), arriving] },
    });

    const after = table.rules.apply(before, step(arriving, secondArm, 1));

    expect(after.groups.get(arriving)?.heads).toBe(1);
    expect(after.groups.get(secondArm)?.heads).toBe(1);
  });
});

// ── Rule: two players' trails may share an arrow ─────────────────────────────

describe('two players’ trails may share an arrow', () => {
  it('marks an arrow for both when a head steps onto enemy trail', () => {
    // "Stepping onto an arrow the enemy's trail holds marks it for both". Nothing
    // evaporates in this packet: under P06 this state is transient, here it
    // persists, and the representation has to allow it either way (P05 D1).
    const table = onBoard();
    const n1 = anArrow(table.geometry);
    const x1 = anExitFrom(table.geometry, n1);
    const before = stateOf([{ arrow: n1, owner: A, heads: 1 }], A, {
      trail: { A: [n1], B: [x1] },
    });

    const after = table.rules.apply(before, step(n1, x1, 1));

    expect(isTrail(after, A, x1)).toBe(true);
    expect(isTrail(after, B, x1)).toBe(true);
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
