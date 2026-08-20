/**
 * docs/spec/losing-conditions/losing-conditions.core.feature — one test per scenario.
 *
 * @see docs/spec/losing-conditions/losing-conditions.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, rational, step } from '@conquarrow/contracts';
import type { ArrowId, PlayerId } from '@conquarrow/contracts';
import { isLost } from '../src/victory';
import {
  A,
  B,
  C,
  SIX,
  THREE,
  aBoard,
  aVertex,
  bareArrow,
  closeRound,
  closeRounds,
  held,
  holdingsOf,
  isUnowned,
  livingSeats,
  readingsOf,
  seatState,
  shareArrow,
  streakOf,
} from './losing.support';
import {
  aRingWithAnInside,
  anExitFrom,
  arrowAt,
  headsOn,
  onTiling,
  ownerOf,
  pick,
} from './support';

// ── Rule: Owning no territory is a loss ──────────────────────────────────────

describe('owning no territory is a loss', () => {
  it('loses a player whose last territory is carved away, on the carving move', () => {
    // Fill needs the plane (§11 item 4), so this one scenario runs on the tiling.
    const table = onTiling();
    const ring = aRingWithAnInside(table.geometry);
    const tip = arrowAt(ring.wall, 5);
    const landing = anExitFrom(table.geometry, tip);
    const home = pick(table.geometry.inArrows(table.geometry.origin(arrowAt(ring.wall, 0))), 0);
    // Two seats here on purpose: a third would have to own tiling territory the
    // ring helper does not offer, and would be lost incidentally.
    const before = seatState({
      players: [A, B],
      activePlayer: B,
      groups: [
        { arrow: tip, owner: B, heads: 1 },
        { arrow: ring.far, owner: A, heads: 2 },
      ],
      trails: [
        [B, ring.wall],
        [A, [ring.far]],
      ],
      territory: [...held([home, landing], B), { arrow: ring.inside, owner: A }],
    });

    // P37: the carve takes A's last arrow, so A goes on this step, not at the
    // next boundary — and with A gone B is the only seat left.
    const after = table.rules.apply(before, step(tip, landing, 1));

    expect(after.territory.get(ring.inside)).toBe(B);
    expect(isLost(after, A, table.geometry)).toBe(true);
    expect(holdingsOf(after, A).heads).toBe(0);
    expect(holdingsOf(after, A).trail).toEqual([]);
    expect(holdingsOf(after, A).land).toEqual([]);
    expect(after.winner).toBe(B);
  });

  it('loses a player with heads and no territory', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 3 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(true);
  });

  it('leaves the vacated territory owned by nobody, not by the claimant', () => {
    const ground = aBoard();
    const land = [bareArrow(ground, 0), bareArrow(ground, 1)];
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        ...held(land, A),
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      accumulators: [
        [bareArrow(ground, 0), rational(1, 2)],
        [bareArrow(ground, 1), rational(5, 6)],
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
    });

    const after = closeRound(ground.rules, before);

    for (const arrow of land) {
      expect(isUnowned(after, arrow)).toBe(true);
      expect(after.accumulators.has(arrow)).toBe(false);
    }
  });

  it('leaves every other seat untouched when one loses', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 2 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 3 },
      ],
      trails: [
        [A, [bareArrow(ground, 0)]],
        [B, [shareArrow(ground, 0), bareArrow(ground, 1)]],
        [C, [shareArrow(ground, 1), bareArrow(ground, 2)]],
      ],
      territory: [
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
    });
    const bBefore = holdingsOf(before, B);
    const cBefore = holdingsOf(before, C);

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(true);
    expect(holdingsOf(after, B)).toEqual(bBefore);
    expect(holdingsOf(after, C)).toEqual(cBefore);
  });
});

// ── Rule: Territory but no income starts a clock, not a loss ──────────────────

describe('territory but no income starts a clock, not a loss', () => {
  const destituteBoard = (streaks: readonly (readonly [PlayerId, number])[] = []) => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0)], A),
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      starvationStreaks: streaks,
      dominationN: 5,
    });
    return { ground, before };
  };

  it('does not lose a destitute player who still holds heads', () => {
    const { ground, before } = destituteBoard();

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(false);
    expect(streakOf(after, A)).toBe(1);
  });

  it('advances the streak on each full round', () => {
    const { ground, before } = destituteBoard();

    const after = closeRounds(ground.rules, before, 4);

    expect(streakOf(after, A)).toBe(4);
    expect(isLost(after, A, ground.geometry)).toBe(false);
  });

  it('loses the seat when the streak reaches the threshold', () => {
    const { ground, before } = destituteBoard();
    expect(before.dominationN).toBe(5);

    const after = closeRounds(ground.rules, before, 5);

    expect(isLost(after, A, ground.geometry)).toBe(true);
    expect(holdingsOf(after, A).heads).toBe(0);
  });

  it('clears the clock when the seat owns a share again', () => {
    const ground = aBoard();
    // A holds a streak of 3 and has just taken share 2 — the clock clears.
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0), shareArrow(ground, 2)], A),
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      starvationStreaks: [[A, 3]],
    });

    const after = closeRound(ground.rules, before);

    expect(streakOf(after, A)).toBe(0);
  });
});

// ── Rule: Territory but no units is a loss only without income ────────────────

describe('territory but no units is a loss only without income', () => {
  it('loses a seat with no heads and no share immediately', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0)], A),
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      dominationN: 5,
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(true);
  });

  it('keeps a headless seat with a share alive', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 2), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: shareArrow(ground, 0), owner: A },
        { arrow: shareArrow(ground, 1), owner: B },
        { arrow: shareArrow(ground, 2), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 1 }]],
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(false);
    expect(streakOf(after, A)).toBe(0);
  });

  it('pays a headless seat with a share and lets it resume', () => {
    const ground = aBoard();
    const feed = shareArrow(ground, 0);
    const phase = ground.shares.indexOf(feed);
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 2), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: feed, owner: A },
        { arrow: shareArrow(ground, 1), owner: B },
        { arrow: shareArrow(ground, 2), owner: C },
      ],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[aVertex(ground), { force: rational(1, 3), phase }]],
    });

    const after = closeRound(ground.rules, before);

    expect(holdingsOf(after, A).heads).toBe(1);
    expect(ownerOf(after, feed)).toBe(A);
    expect(isLost(after, A, ground.geometry)).toBe(false);
  });

  it('offers a waiting headless seat nothing but the end of its turn', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      activePlayer: A,
      groups: [{ arrow: shareArrow(ground, 1), owner: B, heads: 1 }],
      territory: [
        { arrow: shareArrow(ground, 0), owner: A },
        { arrow: shareArrow(ground, 1), owner: B },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 1 }]],
    });

    expect(ground.rules.legalMoves(before)).toEqual([endTurn()]);

    // The pass applies nothing: no piece moves and the chair simply advances.
    const after = ground.rules.apply(before, endTurn());
    expect(after.activePlayer).toBe(B);
    expect(holdingsOf(after, A)).toEqual(holdingsOf(before, A));
    expect(holdingsOf(after, B)).toEqual(holdingsOf(before, B));
  });
});

// ── Rule: Destitution is per seat ─────────────────────────────────────────────

describe('destitution is per seat', () => {
  const twoDestitute = (
    streaks: readonly (readonly [PlayerId, number])[] = [],
    aAlso: readonly ArrowId[] = [],
  ) => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: bareArrow(ground, 1), owner: B, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0), ...aAlso], A),
        ...held([bareArrow(ground, 1)], B),
        { arrow: shareArrow(ground, 0), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      starvationStreaks: streaks,
      dominationN: 5,
    });
    return { ground, before };
  };

  it('advances both destitute seats', () => {
    const { ground, before } = twoDestitute();

    const after = closeRound(ground.rules, before);

    expect(streakOf(after, A)).toBe(1);
    expect(streakOf(after, B)).toBe(1);
  });

  it('lets neither destitute seat clear the other', () => {
    const { ground, before } = twoDestitute();

    const after = closeRounds(ground.rules, before, 4);

    expect(streakOf(after, A)).toBe(4);
    expect(streakOf(after, B)).toBe(4);
  });

  it('does not clear one seat when the other leaves destitution', () => {
    const ground = aBoard();
    // Both on 2; B has just taken share 1, so only B's clock clears.
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: bareArrow(ground, 1), owner: B, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0)], A),
        ...held([bareArrow(ground, 1), shareArrow(ground, 1)], B),
        { arrow: shareArrow(ground, 0), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      starvationStreaks: [
        [A, 2],
        [B, 2],
      ],
      dominationN: 5,
    });

    const after = closeRound(ground.rules, before);

    expect(streakOf(after, B)).toBe(0);
    expect(streakOf(after, A)).toBe(3);
  });

  it('takes both destitute seats when both reach the threshold', () => {
    const { ground, before } = twoDestitute();
    expect(before.dominationN).toBe(5);

    const after = closeRounds(ground.rules, before, 5);

    expect(isLost(after, A, ground.geometry)).toBe(true);
    expect(isLost(after, B, ground.geometry)).toBe(true);
  });
});

// ── Rule: The match ends when one seat remains ────────────────────────────────

describe('the match ends when one seat remains', () => {
  it('wins the match for the last seat standing', () => {
    const ground = aBoard();
    // C is already gone — nothing on the board at all. B owns no territory.
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 0), owner: A, heads: 1 },
        { arrow: bareArrow(ground, 0), owner: B, heads: 2 },
      ],
      territory: [{ arrow: shareArrow(ground, 0), owner: A }],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
    });
    expect(readingsOf(before, B, ground.geometry)).toEqual({ territory: 0, shares: 0, heads: 2 });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, B, ground.geometry)).toBe(true);
    expect(after.winner).toBe(A);
  });

  it('sets no winner while two seats remain', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 0), owner: A, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: bareArrow(ground, 0), owner: C, heads: 2 },
      ],
      territory: [
        { arrow: shareArrow(ground, 0), owner: A },
        { arrow: shareArrow(ground, 1), owner: B },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 2 }]],
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, C, ground.geometry)).toBe(true);
    expect(after.winner).toBeUndefined();
  });

  it('never chooses the winner by seat order', () => {
    // Six seats, two spawners: five own a share, C owns bare ground and starves
    // out. A sits earliest in `players`, which is exactly who the repealed
    // two-player shortcut handed the match to.
    const ground = aBoard(2);
    const seats: readonly PlayerId[] = SIX;
    const cSeat = C;
    let slot = 0;
    const groups: { arrow: ArrowId; owner: PlayerId; heads: number }[] = [];
    const territory: { arrow: ArrowId; owner: PlayerId }[] = [];
    for (const seat of seats) {
      if (seat === cSeat) {
        groups.push({ arrow: bareArrow(ground, 0), owner: seat, heads: 1 });
        territory.push({ arrow: bareArrow(ground, 0), owner: seat });
        continue;
      }
      const arrow = shareArrow(ground, slot);
      slot += 1;
      groups.push({ arrow, owner: seat, heads: 1 });
      territory.push({ arrow, owner: seat });
    }
    const before = seatState({
      players: SIX,
      groups,
      territory,
      spawners: ground.vertices.map(
        (vertex) => [vertex, { force: rational(1, 12), phase: 0 }] as const,
      ),
      starvationStreaks: [[cSeat, 4]],
      dominationN: 5,
    });
    expect(readingsOf(before, cSeat, ground.geometry)).toEqual({
      territory: 1,
      shares: 0,
      heads: 1,
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, cSeat, ground.geometry)).toBe(true);
    expect(after.winner).toBeUndefined();
    expect(livingSeats(after, ground.geometry)).toEqual(['A', 'B', 'D', 'E', 'F']);
  });
});

// ── Rule: Loss resolves at the boundary and nowhere else ──────────────────────

describe('loss resolves on the move that causes it', () => {
  // P37 superseded the three cases that used to live here — *does not evaluate
  // loss on a step / on a convert / on a skip*. Their inverses are the contract
  // now, and they are asserted in `immediate-loss.core.test.ts` (the *Each move
  // kind resolves losses* outline) rather than restated here.
  //
  // What stays is the one boundary case P37 did **not** move: a starvation streak
  // still advances only at a full round, so a starvation loss still lands there.

  it('clears the clock when a share is captured before the boundary, and pays that share', () => {
    const ground = aBoard();
    // A is one round below the threshold and has just captured share 2, so the
    // clock clears at this boundary instead of firing.
    const feed = shareArrow(ground, 2);
    const phase = ground.shares.indexOf(feed);
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 1 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0), feed], A),
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
      accumulators: [[feed, rational(2, 3)]],
      spawners: [[aVertex(ground), { force: rational(1, 3), phase }]],
      starvationStreaks: [[A, 4]],
      dominationN: 5,
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(false);
    expect(streakOf(after, A)).toBe(0);
    expect(headsOn(after, feed)).toBe(1);
  });
});

// ── Rule: The rotation is never rewritten ────────────────────────────────────

describe('the rotation is never rewritten', () => {
  it('keeps a lost seat in the player list, in its original position', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 2 },
        { arrow: shareArrow(ground, 0), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 1), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: shareArrow(ground, 0), owner: B },
        { arrow: shareArrow(ground, 1), owner: C },
      ],
    });

    const after = closeRound(ground.rules, before);

    expect(isLost(after, A, ground.geometry)).toBe(true);
    expect([...after.players].map(String)).toEqual(['A', 'B', 'C']);
    expect(after.players.indexOf(A)).toBe(0);
  });

  it('never reorders the player list across many losses', () => {
    const ground = aBoard();
    // A has nothing; B is destitute with a clock; C keeps a share.
    let state = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 0), owner: A, heads: 1 },
        { arrow: bareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 0), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 1)], B),
        { arrow: shareArrow(ground, 0), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
      dominationN: 3,
    });
    const original = [...state.players].map(String);

    for (let round = 0; round < 6; round += 1) {
      state = closeRound(ground.rules, state);
      expect([...state.players].map(String)).toEqual(original);
    }
    expect(isLost(state, A, ground.geometry)).toBe(true);
    expect(isLost(state, B, ground.geometry)).toBe(true);
  });

  it('still fires the round boundary when the first seat is lost', () => {
    const ground = aBoard();
    const feed = shareArrow(ground, 0);
    const phase = ground.shares.indexOf(feed);
    // A is players[0] and holds nothing at all.
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 2), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: feed, owner: B },
        { arrow: shareArrow(ground, 1), owner: B },
        { arrow: shareArrow(ground, 2), owner: C },
      ],
      spawners: [[aVertex(ground), { force: rational(1, 3), phase }]],
    });
    // A qualifies by the first row of the table — nothing at all on the board.
    expect(readingsOf(before, A, ground.geometry)).toEqual({
      territory: 0,
      shares: 0,
      heads: 0,
    });

    const after = closeRounds(ground.rules, before, 3);

    expect(after.spawners.get(aVertex(ground))?.phase).toBe((phase + 3) % 3);
    expect(after.accumulators.get(feed)).toEqual(rational(1, 3));
  });
});
