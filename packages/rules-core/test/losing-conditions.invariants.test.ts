/**
 * The 23 EARS invariants of docs/spec/losing-conditions/losing-conditions.md,
 * as properties rather than examples.
 *
 * The generator is the whole point here. Every invariant below is quantified over
 * **every assignment of the decided table's six rows to three seats** — 216
 * boards — so a rule that happens to hold for one destitute seat and breaks for
 * two is caught by construction rather than by having thought of it. That is the
 * exact shape of the defect P36 fixes: `tickDomination` advanced only when
 * *exactly one* living player was destitute.
 *
 * @see docs/spec/losing-conditions/losing-conditions.md
 * @see .claude/skills/rules-invariants/SKILL.md
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endTurn, rational } from '@conquarrow/contracts';
import type { ArrowId, GameState, PlayerId } from '@conquarrow/contracts';
import { replay, replayIsDeterministic } from '../src/replay';
import { isLost, shareCountOf, territoryCountOf } from '../src/victory';
import {
  A,
  B,
  C,
  D,
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
  lostSeats,
  readingsOf,
  roundMoves,
  seatState,
  shareArrow,
  streakOf,
} from './losing.support';
import type { Ground } from './losing.support';
import { headsOn, snapshot } from './support';

// ── the generator ────────────────────────────────────────────────────────────

/** One row of the decided table (§9), as holdings a seat can be given. */
type Row = 0 | 1 | 2 | 3 | 4 | 5;
const ROWS: readonly Row[] = [0, 1, 2, 3, 4, 5];

/** `T`, `S`, `H` for each row, in the table's order. */
const READINGS: readonly { t: boolean; s: boolean; h: boolean }[] = [
  { t: false, s: false, h: false }, // T=0
  { t: false, s: false, h: true }, // T=0, heads
  { t: true, s: false, h: false }, // territory, no share, no head
  { t: true, s: false, h: true }, // territory, no share, heads — the clock
  { t: true, s: true, h: false }, // share, no head — alive, passed over
  { t: true, s: true, h: true }, // normal play
];

const readingFor = (row: Row): { t: boolean; s: boolean; h: boolean } => {
  const reading = READINGS[row];
  if (reading === undefined) throw new Error('setup: no such table row');
  return reading;
};

/**
 * A board giving seat `i` the holdings of `rows[i]`.
 *
 * Every seat gets its own share arrow and its own bare arrow, so no two seats
 * can collide and each reading is exactly what the row says.
 */
const boardFor = (
  ground: Ground,
  rows: readonly Row[],
  extra: { readonly streaks?: readonly (readonly [PlayerId, number])[]; readonly n?: number } = {},
): GameState => {
  const seats = THREE;
  const groups: { arrow: ArrowId; owner: PlayerId; heads: number }[] = [];
  const territory: { arrow: ArrowId; owner: PlayerId }[] = [];
  seats.forEach((seat, index) => {
    const reading = readingFor(rows[index] ?? 0);
    const share = shareArrow(ground, index);
    const bare = bareArrow(ground, index);
    const stand = bareArrow(ground, index + seats.length);
    if (reading.s) territory.push({ arrow: share, owner: seat });
    else if (reading.t) territory.push({ arrow: bare, owner: seat });
    if (reading.h) groups.push({ arrow: stand, owner: seat, heads: 2 });
  });
  return seatState({
    players: seats,
    groups,
    territory,
    // Phase points at share 2 and force is tiny, so accrual never births a head
    // and never changes a reading — the properties are about the losing rule.
    spawners: [[aVertex(ground), { force: rational(1, 12), phase: 2 }]],
    ...(extra.streaks === undefined ? {} : { starvationStreaks: extra.streaks }),
    dominationN: extra.n ?? 5,
  });
};

/** Every assignment of the six rows to the three seats — 216 boards. */
const everyAssignment = (): readonly (readonly Row[])[] => {
  const all: Row[][] = [];
  for (const a of ROWS) for (const b of ROWS) for (const c of ROWS) all.push([a, b, c]);
  return all;
};

const ASSIGNMENTS = everyAssignment();

/** Whether the row a seat was given qualifies it for immediate loss. */
const rowIsLost = (row: Row): boolean => {
  const reading = readingFor(row);
  return !reading.t || (!reading.s && !reading.h);
};

/** Whether the row a seat was given puts it on the starvation clock. */
const rowIsDestitute = (row: Row): boolean => {
  const reading = readingFor(row);
  return reading.t && !reading.s && reading.h;
};

// ── 1-3: the derived predicate is exactly the table ──────────────────────────

describe('the derived predicate', () => {
  it('1. records a player owning no territory as lost', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const state = boardFor(ground, rows);
      for (const [index, seat] of THREE.entries()) {
        if (territoryCountOf(state, seat) !== 0) continue;
        expect(isLost(state, seat, ground.geometry), `rows ${rows.join('')} seat ${String(index)}`).toBe(
          true,
        );
      }
    }
  });

  it('2. records a player with territory, no share and no head as lost', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const state = boardFor(ground, rows);
      for (const seat of THREE) {
        const r = readingsOf(state, seat, ground.geometry);
        if (r.territory === 0 || r.shares > 0 || r.heads > 0) continue;
        expect(isLost(state, seat, ground.geometry)).toBe(true);
      }
    }
  });

  it('3. does not record a player with territory, a share and no head as lost', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const state = boardFor(ground, rows);
      for (const seat of THREE) {
        const r = readingsOf(state, seat, ground.geometry);
        if (r.shares === 0 || r.heads > 0) continue;
        expect(isLost(state, seat, ground.geometry)).toBe(false);
      }
    }
  });
});

// ── 4-7: the starvation clock ────────────────────────────────────────────────

describe('the starvation clock', () => {
  it('4. advances a destitute seat at each full round', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      let state = boardFor(ground, rows, { n: 99 });
      for (let round = 1; round <= 3; round += 1) {
        state = closeRound(ground.rules, state);
        THREE.forEach((seat, index) => {
          if (!rowIsDestitute(rows[index] ?? 0)) return;
          expect(streakOf(state, seat), `rows ${rows.join('')} seat ${String(index)}`).toBe(round);
        });
      }
    }
  });

  it('5. advances every destitute seat regardless of how many others are destitute', () => {
    const ground = aBoard();
    // The defect this replaces: the clock only ran while *exactly one* seat was
    // destitute, so two broke seats cancelled each other indefinitely.
    for (const rows of ASSIGNMENTS) {
      const destitute = THREE.filter((_, index) => rowIsDestitute(rows[index] ?? 0));
      if (destitute.length === 0) continue;
      const after = closeRound(ground.rules, boardFor(ground, rows, { n: 99 }));
      for (const seat of destitute) expect(streakOf(after, seat)).toBe(1);
    }
  });

  it('6. clears only the seat that owns a share again', () => {
    const ground = aBoard();
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: bareArrow(ground, 3), owner: A, heads: 1 },
        { arrow: bareArrow(ground, 4), owner: B, heads: 1 },
        { arrow: bareArrow(ground, 5), owner: C, heads: 1 },
      ],
      territory: [
        ...held([bareArrow(ground, 0)], A),
        // B has just taken a share; A and C are still broke.
        ...held([bareArrow(ground, 1), shareArrow(ground, 1)], B),
        ...held([bareArrow(ground, 2)], C),
      ],
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 2 }]],
      starvationStreaks: [
        [A, 2],
        [B, 2],
        [C, 2],
      ],
      dominationN: 99,
    });

    const after = closeRound(ground.rules, before);

    expect(streakOf(after, B)).toBe(0);
    expect(streakOf(after, A)).toBe(3);
    expect(streakOf(after, C)).toBe(3);
  });

  it('7. loses the seat when its streak reaches the threshold', () => {
    const ground = aBoard();
    for (const n of [1, 2, 3]) {
      const rows: readonly Row[] = [3, 5, 5];
      let state = boardFor(ground, rows, { n });
      for (let round = 1; round <= n; round += 1) {
        state = closeRound(ground.rules, state);
        // Only the last round of the streak may take the seat: this is the tick
        // running *before* the resolution, and it is what makes the boundary
        // order observable.
        expect(isLost(state, A, ground.geometry), `n=${String(n)} round=${String(round)}`).toBe(
          round === n,
        );
      }
    }
  });
});

// ── 8-10: what removal does, and what it leaves alone ────────────────────────

describe('removal', () => {
  it('8. removes every head, trail mark and territory arrow of a lost seat', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const seeded = boardFor(ground, rows);
      const withTrails = seatState({
        players: THREE,
        groups: [...seeded.groups].map(([arrow, group]) => ({
          arrow,
          owner: group.owner,
          heads: group.heads,
        })),
        trails: THREE.map((seat, index) => [seat, [bareArrow(ground, index)]] as const),
        territory: [...seeded.territory].map(([arrow, owner]) => ({ arrow, owner })),
        spawners: [[aVertex(ground), { force: rational(1, 12), phase: 2 }]],
      });

      const after = closeRound(ground.rules, withTrails);

      THREE.forEach((seat, index) => {
        if (!rowIsLost(rows[index] ?? 0)) return;
        expect(holdingsOf(after, seat), `rows ${rows.join('')} seat ${String(index)}`).toEqual({
          heads: 0,
          stacks: [],
          trail: [],
          land: [],
        });
      });
    }
  });

  it('9. leaves the vacated arrows unowned with their accumulators reset', () => {
    const ground = aBoard();
    const vacated = [bareArrow(ground, 0), bareArrow(ground, 1)];
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: shareArrow(ground, 2), owner: C, heads: 1 },
      ],
      territory: [
        ...held(vacated, A),
        { arrow: shareArrow(ground, 1), owner: B },
        { arrow: shareArrow(ground, 2), owner: C },
      ],
      accumulators: vacated.map((arrow) => [arrow, rational(5, 6)] as const),
      spawners: [[aVertex(ground), { force: rational(1, 12), phase: 0 }]],
    });

    const after = closeRound(ground.rules, before);

    for (const arrow of vacated) {
      expect(isUnowned(after, arrow)).toBe(true);
      expect(after.accumulators.has(arrow)).toBe(false);
    }
  });

  it('10. leaves every other seat heads, trails and territory unchanged', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      const survivorsBefore = THREE.filter((_, i) => !rowIsLost(rows[i] ?? 0)).map((seat) =>
        holdingsOf(before, seat),
      );

      const after = closeRound(ground.rules, before);

      const survivorsAfter = THREE.filter((_, i) => !rowIsLost(rows[i] ?? 0)).map((seat) =>
        holdingsOf(after, seat),
      );
      expect(survivorsAfter, `rows ${rows.join('')}`).toEqual(survivorsBefore);
    }
  });

  it('22. never records as lost a player who owns a spawner share', () => {
    // The share theorem. `S > 0` puts a player in an *alive* row of every case,
    // so no seat that qualifies to be lost owns a share. Two consequences the
    // spec draws from it: accrual can neither save a seat nor clear a streak,
    // and removal never vacates a spawner-border arrow.
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      for (const seat of THREE) {
        if (shareCountOf(before, seat, ground.geometry) === 0) continue;
        expect(isLost(before, seat, ground.geometry), `rows ${rows.join('')}`).toBe(false);
      }
    }
  });
});

// ── 11-13: when loss resolves ────────────────────────────────────────────────

describe('when loss resolves', () => {
  // Invariants 11 and 12 — *evaluate loss only at a full-round boundary* and
  // *evaluate no loss during a step, a skip or a convert* — are **superseded by
  // P37**, which resolves losses at the tail of every `apply`. Their replacements
  // are `immediate-loss`'s invariants 1, 2 and 5, asserted in
  // `immediate-loss.invariants.test.ts`. Nothing is asserted here in their place,
  // because the two statements are now false and a weakened restatement of a
  // repealed rule reads like a rule.

  it('13. advances streaks before resolving losses, so a seat goes on the round its streak reaches the threshold', () => {
    const ground = aBoard();
    const state = closeRounds(ground.rules, boardFor(ground, [3, 5, 5], { n: 2 }), 1);
    expect(streakOf(state, A)).toBe(1);
    expect(isLost(state, A, ground.geometry)).toBe(false);
    const later = closeRound(ground.rules, state);
    expect(isLost(later, A, ground.geometry)).toBe(true);

    // Accrue-before-resolve is *vacuously* safe rather than load-bearing: by the
    // share theorem (22) accrual and removal touch disjoint arrows, so their
    // order cannot change an outcome. A headless share owner is paid and stays
    // in; it was never a loss candidate.
    const feed = shareArrow(ground, 0);
    const phase = ground.shares.indexOf(feed);
    const paid = closeRound(
      ground.rules,
      seatState({
        players: THREE,
        groups: [{ arrow: shareArrow(ground, 1), owner: B, heads: 1 }],
        territory: [
          { arrow: feed, owner: A },
          { arrow: shareArrow(ground, 1), owner: B },
        ],
        accumulators: [[feed, rational(2, 3)]],
        spawners: [[aVertex(ground), { force: rational(1, 3), phase }]],
      }),
    );
    expect(headsOn(paid, feed)).toBe(1);
    expect(isLost(paid, A, ground.geometry)).toBe(false);
  });
});

// ── 14-15: the rotation ──────────────────────────────────────────────────────

describe('the rotation', () => {
  it('14. never removes a seat from state.players, nor reorders it', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      let state = boardFor(ground, rows, { n: 2 });
      const original = [...state.players].map(String);
      for (let round = 0; round < 4; round += 1) {
        state = closeRound(ground.rules, state);
        expect([...state.players].map(String), `rows ${rows.join('')}`).toEqual(original);
      }
    }
  });

  it('15. passes the turn of a seat with no legal move, applying nothing', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      // P37: the generator authors boards holding seats §8 calls unplayable, and
      // the first move now settles them. The pass is measured on the settled
      // board — a *further* pass must still apply nothing.
      const state = ground.rules.apply(boardFor(ground, rows), endTurn());
      for (const seat of THREE) {
        const seated: GameState = { ...state, activePlayer: seat };
        if (ground.rules.legalMoves(seated).some((move) => move.kind === 'step')) continue;
        expect(ground.rules.legalMoves(seated)).toEqual([endTurn()]);
        const passed = ground.rules.apply(seated, endTurn());
        for (const other of THREE) {
          if (passed.activePlayer === passed.players[0]) continue;
          expect(holdingsOf(passed, other)).toEqual(holdingsOf(seated, other));
        }
      }
    }
  });
});

// ── 16-18: the winner ────────────────────────────────────────────────────────

describe('the winner', () => {
  it('16. sets winner to the one player not lost, when exactly one remains', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const survivors = THREE.filter((_, i) => !rowIsLost(rows[i] ?? 0));
      if (survivors.length !== 1) continue;
      const after = closeRound(ground.rules, boardFor(ground, rows));
      expect(after.winner, `rows ${rows.join('')}`).toBe(survivors[0]);
    }
  });

  it('17. leaves winner unset while two or more players are not lost', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const survivors = THREE.filter((_, i) => !rowIsLost(rows[i] ?? 0));
      if (survivors.length < 2) continue;
      const after = closeRound(ground.rules, boardFor(ground, rows));
      expect(after.winner, `rows ${rows.join('')}`).toBeUndefined();
    }
  });

  it('18. never sets winner to a player chosen by position in state.players', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const survivors = THREE.filter((_, i) => !rowIsLost(rows[i] ?? 0));
      if (survivors.length === 1) continue;
      const after = closeRound(ground.rules, boardFor(ground, rows));
      // Zero survivors is SPEC §11 item 44 — terminal but unwon, recorded as
      // wrong rather than resolved into a draw.
      expect(after.winner, `rows ${rows.join('')}`).toBeUndefined();
      expect(livingSeats(after, ground.geometry).length).toBe(survivors.length);
    }
  });
});

// ── 19-21: determinism ──────────────────────────────────────────────────────

describe('determinism', () => {
  it('19. produces a result independent of every map insertion order, and reports lost seats in player order', () => {
    const ground = aBoard();
    const holdings: readonly (readonly [PlayerId, ArrowId])[] = [
      [A, bareArrow(ground, 0)],
      [B, bareArrow(ground, 1)],
      [C, bareArrow(ground, 2)],
    ];
    // D holds the spawner's three shares, so it survives the boundary and there
    // is something left to compare: three seats going leaves every map empty, and
    // empty maps compare equal however the engine reached them. D's rows are
    // **interleaved** with the varied ones so the removals open gaps in different
    // places, and what survives is compared as **raw key order** rather than
    // through `snapshot`, which sorts.
    const board = (rows: readonly (readonly [PlayerId, ArrowId])[]): GameState =>
      seatState({
        players: [A, B, C, D],
        groups: [{ arrow: shareArrow(ground, 0), owner: D, heads: 1 }],
        territory: rows.flatMap(([owner, arrow], i) => [
          { arrow, owner },
          { arrow: shareArrow(ground, i), owner: D },
        ]),
        spawners: [[aVertex(ground), { force: rational(1, 12), phase: 1 }]],
      });

    const forward = closeRound(ground.rules, board(holdings));
    const backward = closeRound(ground.rules, board([...holdings].reverse()));

    expect(lostSeats(forward, ground.geometry)).toEqual(['A', 'B', 'C']);
    expect(lostSeats(backward, ground.geometry)).toEqual(['A', 'B', 'C']);
    expect([...forward.territory.keys()].map(String)).toEqual(
      [shareArrow(ground, 0), shareArrow(ground, 1), shareArrow(ground, 2)].map(String),
    );
    expect([...forward.territory.keys()]).toEqual([...backward.territory.keys()]);
    expect(snapshot(forward)).toEqual(snapshot(backward));
  });

  it('23. resolves every qualifying seat before setting winner', () => {
    // Quantified: whenever *every* seat qualifies, `winner` must stay unset. A
    // win check inside the per-seat loop would crown the last seat standing in
    // the instant before it too was removed, and it would do so for every one of
    // these boards.
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      if (!rows.every((row) => rowIsLost(row))) continue;
      const after = closeRound(ground.rules, boardFor(ground, rows));
      expect(after.winner, `rows ${rows.join('')}`).toBeUndefined();
      expect(lostSeats(after, ground.geometry)).toEqual(['A', 'B', 'C']);
    }
  });

  it('20. produces equal losses in equal order from equal states', () => {
    const ground = aBoard();
    for (const rows of ASSIGNMENTS) {
      const left = closeRound(ground.rules, boardFor(ground, rows));
      const right = closeRound(ground.rules, boardFor(ground, rows));
      expect(snapshot(left), `rows ${rows.join('')}`).toEqual(snapshot(right));
      expect(lostSeats(left, ground.geometry)).toEqual(lostSeats(right, ground.geometry));
    }
  });

  it('21. loses the same seats at the same boundaries on replay', () => {
    const ground = aBoard();
    const initial = boardFor(ground, [3, 3, 5], { n: 3 });
    const log = [0, 1, 2, 3].flatMap(() => roundMoves(initial.players));

    const first = replay(ground.rules, initial, log);
    const second = replay(ground.rules, initial, log);

    expect(lostSeats(first, ground.geometry)).toEqual(['A', 'B']);
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(replayIsDeterministic(ground.rules, initial, log, snapshot)).toBe(true);
  });

  it('keeps the core pure: no clock, no randomness, no input mutation', () => {
    const ground = aBoard();
    const before = boardFor(ground, [1, 3, 5], { n: 1 });
    const taken = snapshot(before);

    closeRound(ground.rules, before);

    expect(snapshot(before)).toEqual(taken);
    const src = readFileSync(new URL('../src/victory.ts', import.meta.url), 'utf8');
    for (const banned of ['Date', 'Math.random', 'performance', 'crypto', 'process']) {
      expect(src).not.toContain(banned);
    }
  });
});
