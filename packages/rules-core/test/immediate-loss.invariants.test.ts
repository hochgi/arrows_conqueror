/**
 * The 15 EARS invariants of docs/spec/immediate-loss/immediate-loss.md, as
 * properties rather than examples.
 *
 * The generator is the point, as it was for P36: every timing invariant below is
 * quantified over **every assignment of the four-case table's six rows to three
 * seats** — 216 boards — and over **all three move kinds**, so a rule that holds
 * for one landless seat and breaks for two is caught by construction. P37's
 * change is a change to *when* every one of those boards settles, which is
 * exactly the kind of thing a single hand-picked board hides.
 *
 * Invariants 9 and 10 are the item-44 chain and are quantified over every state a
 * replay passes through rather than over its endpoints, because the state the
 * chain rules out would exist for one move and be gone by the last.
 *
 * @see docs/spec/immediate-loss/immediate-loss.md
 * @see .claude/skills/rules-invariants/SKILL.md
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endTurn, skip, step } from '@conquarrow/contracts';
import type { ArrowId, GameState, Move, PlayerId } from '@conquarrow/contracts';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '../src/index';
import { headsOf, isLost, shareCountOf, territoryCountOf } from '../src/victory';
import {
  aMatchLosingThree,
  landOf,
  lostAlong,
  playtestLog,
  someSeatIsAlive,
  someSeatOwnsAShare,
  statesAlong,
} from './immediate.support';
import {
  A,
  B,
  C,
  THREE,
  aBoard,
  aVertex,
  bareArrow,
  closeRound,
  holdingsOf,
  seatState,
  shareArrow,
  streakOf,
} from './losing.support';
import type { Ground } from './losing.support';
import { anExitFrom, snapshot } from './support';
import { replayIsDeterministic } from '../src/replay';

const FORCE = { num: 1, den: 3 } as const;

// ── the generator ────────────────────────────────────────────────────────────

/** One row of the four-case table (§9), as holdings a seat can be given. */
type Row = 0 | 1 | 2 | 3 | 4 | 5;
const ROWS: readonly Row[] = [0, 1, 2, 3, 4, 5];

/** `T`, `S`, `H` for each row, in the table's order. */
const READINGS: readonly { t: boolean; s: boolean; h: boolean }[] = [
  { t: false, s: false, h: false }, // T=0
  { t: false, s: false, h: true }, // T=0, heads
  { t: true, s: false, h: false }, // ground, no share, no head
  { t: true, s: false, h: true }, // ground, no share, heads — the clock
  { t: true, s: true, h: false }, // share, no head — alive, passed over
  { t: true, s: true, h: true }, // normal play
];

const readingFor = (row: Row): { t: boolean; s: boolean; h: boolean } => {
  const reading = READINGS[row];
  if (reading === undefined) throw new Error('setup: no such table row');
  return reading;
};

/** Every assignment of the six rows to three seats. */
const ASSIGNMENTS: readonly (readonly Row[])[] = ROWS.flatMap((a) =>
  ROWS.flatMap((b) => ROWS.map((c) => [a, b, c] as const)),
);

/**
 * A board giving seat `i` the holdings of `rows[i]`.
 *
 * Every seat gets its own share arrow and its own bare arrow, so no two seats can
 * collide and each reading is exactly what the row says. `activePlayer` is
 * `players[0]`, so one end-turn is one seat and three are one round.
 */
const boardFor = (ground: Ground, rows: readonly Row[], threshold = 5): GameState => {
  const groups: { arrow: ArrowId; owner: PlayerId; heads: number }[] = [];
  const territory: { arrow: ArrowId; owner: PlayerId }[] = [];
  THREE.forEach((seat, index) => {
    const reading = readingFor(rows[index] ?? 0);
    const share = shareArrow(ground, index);
    const bare = bareArrow(ground, index);
    const stand = bareArrow(ground, index + THREE.length);
    if (reading.s) territory.push({ arrow: share, owner: seat });
    else if (reading.t) territory.push({ arrow: bare, owner: seat });
    if (reading.h) groups.push({ arrow: stand, owner: seat, heads: 2 });
  });
  return seatState({
    players: THREE,
    activePlayer: A,
    groups,
    territory,
    spawners: [[aVertex(ground), { force: FORCE, phase: 0 }]],
    dominationN: threshold,
  });
};

/** Whichever moves the active seat may make, one of each kind that is offered. */
const oneOfEachKind = (ground: Ground, state: GameState): readonly Move[] => {
  const mine = [...state.groups.entries()].find(
    ([, group]) => group.owner === state.activePlayer,
  );
  if (mine === undefined) return [endTurn()];
  const [arrow] = mine;
  return [step(arrow, anExitFrom(ground.geometry, arrow), 1), skip(arrow), endTurn()];
};

/** Seats the four-case table says are lost, read off a state. */
const qualifying = (state: GameState, ground: Ground): readonly string[] =>
  state.players
    .filter(
      (seat) =>
        territoryCountOf(state, seat) === 0 ||
        (shareCountOf(state, seat, ground.geometry) === 0 && headsOf(state, seat) === 0),
    )
    .map(String);

// ── 1, 2 and 5: the move that causes a loss records it ───────────────────────

describe('a move records the losses it causes', () => {
  it('1. records a player holding no territory as lost in the state that move returns', () => {
    const ground = aBoard();
    const offenders: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      const landless = THREE.filter((seat) => territoryCountOf(before, seat) === 0);
      if (landless.length === 0) continue;
      for (const move of oneOfEachKind(ground, before)) {
        const after = ground.rules.apply(before, move);
        for (const seat of landless) {
          if (holdingsOf(after, seat).heads !== 0 || landOf(after, seat).length !== 0) {
            offenders.push(`${rows.join('')}/${move.kind}/${String(seat)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('2. records a player with territory, no share and no head as lost in that same state', () => {
    const ground = aBoard();
    const offenders: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      const destitute = THREE.filter(
        (seat) =>
          territoryCountOf(before, seat) > 0 &&
          shareCountOf(before, seat, ground.geometry) === 0 &&
          headsOf(before, seat) === 0,
      );
      if (destitute.length === 0) continue;
      for (const move of oneOfEachKind(ground, before)) {
        const after = ground.rules.apply(before, move);
        for (const seat of destitute) {
          if (landOf(after, seat).length !== 0) {
            offenders.push(`${rows.join('')}/${move.kind}/${String(seat)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('5. resolves losses after a step, after a skip and after an end of turn alike', () => {
    const ground = aBoard();
    const disagreements: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      const settled = oneOfEachKind(ground, before).map((move) =>
        lostAlong(ground.rules.apply(before, move), ground.geometry).join(','),
      );
      const [first] = settled;
      if (settled.some((one) => one !== first)) {
        disagreements.push(`${rows.join('')}: ${settled.join(' | ')}`);
      }
      // And every one of them has to have settled the board, not merely agreed.
      for (const move of oneOfEachKind(ground, before)) {
        const after = ground.rules.apply(before, move);
        const stillHolding = qualifying(after, ground).filter(
          (seat) => holdingsOf(after, THREE.find((s) => String(s) === seat) ?? A).land.length > 0,
        );
        if (stillHolding.length > 0) {
          disagreements.push(`${rows.join('')}/${move.kind} left ${stillHolding.join(',')}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});

// ── 3 and 4: the winner, and what a lost seat is offered ─────────────────────

describe('the winner, and what a lost seat is offered', () => {
  it('3. sets the winner in the state the move returns when one seat is left', () => {
    const ground = aBoard();
    const wrong: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      for (const move of oneOfEachKind(ground, before)) {
        const after = ground.rules.apply(before, move);
        const living = THREE.filter((seat) => !isLost(after, seat, ground.geometry));
        const expected = living.length === 1 ? living[0] : undefined;
        if (after.winner !== expected) {
          wrong.push(`${rows.join('')}/${move.kind}: ${String(after.winner)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('4. offers a lost player no move but the pass', () => {
    const ground = aBoard();
    const offered: string[] = [];
    for (const rows of ASSIGNMENTS) {
      // Settle the board first: an authored board can hold seats §8 calls
      // unplayable, and it is the *settled* board a seat is ever offered moves on.
      const settled = ground.rules.apply(boardFor(ground, rows), endTurn());
      for (const seat of THREE) {
        if (!isLost(settled, seat, ground.geometry)) continue;
        const seated: GameState = { ...settled, activePlayer: seat };
        const moves = ground.rules.legalMoves(seated);
        if (moves.some((move) => move.kind !== 'endTurn')) {
          offered.push(`${rows.join('')}/${String(seat)}: ${String(moves.length)}`);
        }
      }
    }
    expect(offered).toEqual([]);
  });
});

// ── 6 and 7: what did *not* move ─────────────────────────────────────────────

describe('what P37 did not move', () => {
  it('6. advances a starvation streak only at a full-round boundary', () => {
    const ground = aBoard();
    const advanced: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows, 5);
      for (const move of oneOfEachKind(ground, before)) {
        if (move.kind === 'endTurn') continue; // one end-turn of three is not a round
        const after = ground.rules.apply(before, move);
        for (const seat of THREE) {
          if (streakOf(after, seat) !== streakOf(before, seat)) {
            advanced.push(`${rows.join('')}/${move.kind}/${String(seat)}`);
          }
        }
      }
    }
    expect(advanced).toEqual([]);
  });

  it('7. accrues, then advances streaks, then resolves losses at the boundary', () => {
    // The order is observable in one board: A owns a share whose accumulator is
    // one step from a head and holds nothing else. Accrue-first pays it, so it is
    // never a loss candidate; resolve-first would have taken it.
    const ground = aBoard();
    const feed = shareArrow(ground, 0);
    const phase = ground.shares.indexOf(feed);
    const before = seatState({
      players: THREE,
      groups: [
        { arrow: shareArrow(ground, 1), owner: B, heads: 1 },
        { arrow: bareArrow(ground, 0), owner: C, heads: 1 },
      ],
      territory: [
        { arrow: feed, owner: A },
        { arrow: shareArrow(ground, 1), owner: B },
        { arrow: bareArrow(ground, 0), owner: C },
      ],
      accumulators: [[feed, { num: 2, den: 3 }]],
      spawners: [[aVertex(ground), { force: FORCE, phase }]],
      starvationStreaks: [[C, 1]],
      dominationN: 2,
    });

    const after = closeRound(ground.rules, before);

    // accrue: A is paid a head. tick: C reaches the threshold. resolve: C goes.
    expect(headsOf(after, A)).toBe(1);
    expect(isLost(after, A, ground.geometry)).toBe(false);
    expect(landOf(after, C)).toEqual([]);
  });
});

// ── 8: the same seats, only sooner ───────────────────────────────────────────

describe('resolving more often changes only when', () => {
  it('8. loses the seats the table qualifies, and no others, over a whole record', () => {
    // The safety property. It cannot be written as a comparison against the
    // pre-P37 engine, because no copy of that engine is kept here and keeping one
    // would be a second implementation to maintain and to be wrong in. What is
    // asserted instead is the mechanism the spec argues from: at the end of the
    // record the seats that are lost are exactly the seats the four-case table
    // says are lost, and applying one more move — a further chance to resolve —
    // changes that set not at all. Removal gives nobody anything, so a resolution
    // that ran sooner cannot have created or spared a loss.
    const { ground, initial, moves } = aMatchLosingThree();

    const { stops } = statesAlong(ground.rules, initial, moves);
    const last = stops[stops.length - 1];
    if (last === undefined) throw new Error('setup: the record applied nothing');

    expect(lostAlong(last.state, ground.geometry)).toEqual(qualifying(last.state, ground));
    const once = ground.rules.apply(last.state, endTurn());
    expect(lostAlong(once, ground.geometry)).toEqual(lostAlong(last.state, ground.geometry));
    // Non-vacuous: seats really were lost along the way.
    expect(lostAlong(last.state, ground.geometry).length).toBeGreaterThan(0);
  });
});

// ── 9, 10 and 11: the item-44 chain ──────────────────────────────────────────

describe('the item-44 chain, over every state a replay passes through', () => {
  const traces = (): readonly {
    readonly name: string;
    readonly states: readonly GameState[];
    readonly geometry: ReturnType<typeof makeTiling>;
  }[] => {
    const log = playtestLog();
    const geometry = makeTiling();
    const opening = makeMatch(log.config);
    const rules = makeRules(geometry);
    const reported = statesAlong(rules, opening, log.moves);
    return [
      {
        name: 'the reported playtest log',
        states: [opening, ...reported.stops.map((stop) => stop.state)],
        geometry,
      },
    ];
  };

  it('9. keeps some player owning at least one spawner share in every state', () => {
    for (const { name, states, geometry } of traces()) {
      const shareless = states.filter((state) => !someSeatOwnsAShare(state, geometry));
      expect({ name, shareless: shareless.length }).toEqual({ name, shareless: 0 });
    }
  });

  it('10. keeps at least one player not lost in every state', () => {
    for (const { name, states, geometry } of traces()) {
      const empty = states.filter((state) => !someSeatIsAlive(state, geometry));
      expect({ name, empty: empty.length }).toEqual({ name, empty: 0 });
    }
  });

  it('11. never leaves the winner unset where every player is lost — vacuous by 10', () => {
    // This is **vacuous**, and the spec says so: invariant 10 makes the antecedent
    // unreachable, so there is no state in which the implication has anything to
    // check. It is written down anyway, and written down as an implication over an
    // empty set rather than dressed up as a live assertion, for one reason: if 10
    // ever breaks, 11 must break with it rather than keep passing on an empty
    // quantifier. So the emptiness itself is what is asserted first.
    for (const { states, geometry } of traces()) {
      const allLost = states.filter((state) => !someSeatIsAlive(state, geometry));
      expect(allLost).toEqual([]);
      for (const state of allLost) expect(state.winner).toBeDefined();
    }
  });
});

// ── 12 to 15: order, determinism, and purity ─────────────────────────────────

describe('order, determinism and purity', () => {
  it('12. resolves losses in state.players order', () => {
    // What this can and cannot show. Per-seat removal gives nobody anything, so
    // removals commute and the *order* of the resolution loop has no falsifying
    // observation of its own (P36 invariant 19 says this in full). So the
    // observable content of "in `state.players` order" is: the seats a state
    // reports as lost come back in that array's order and never in a map's, and
    // the answer does not depend on how the maps were filled. The second half is
    // invariant 13's test; this is the first.
    const ground = aBoard();
    const outOfOrder: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      const after = ground.rules.apply(before, endTurn());
      const reported = lostAlong(after, ground.geometry);
      const inOrder = after.players
        .filter((seat) => isLost(after, seat, ground.geometry))
        .map(String);
      if (reported.join(',') !== inOrder.join(',')) outOfOrder.push(rows.join(''));
    }
    expect(outOfOrder).toEqual([]);
  });

  it('13. produces equal losses from equal states', () => {
    const ground = aBoard();
    const disagreements: string[] = [];
    for (const rows of ASSIGNMENTS) {
      const before = boardFor(ground, rows);
      // Equal states, built with their maps filled in the opposite order.
      const twin: GameState = {
        ...before,
        groups: new Map([...before.groups].toReversed()),
        territory: new Map([...before.territory].toReversed()),
      };
      const left = ground.rules.apply(before, endTurn());
      const right = ground.rules.apply(twin, endTurn());
      if (JSON.stringify(snapshot(left)) !== JSON.stringify(snapshot(right))) {
        disagreements.push(rows.join(''));
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('14. loses the same seats on the same moves when the record is replayed', () => {
    const { ground, initial, moves } = aMatchLosingThree();

    const first = statesAlong(ground.rules, initial, moves);
    const second = statesAlong(ground.rules, initial, moves);

    expect(
      first.stops.map((stop) => ({ at: stop.at, lost: lostAlong(stop.state, ground.geometry) })),
    ).toEqual(
      second.stops.map((stop) => ({ at: stop.at, lost: lostAlong(stop.state, ground.geometry) })),
    );
    expect(replayIsDeterministic(ground.rules, initial, moves, snapshot)).toBe(true);
  });

  it('15. references neither a clock nor a random source in victory.ts', () => {
    const src = readFileSync(new URL('../src/victory.ts', import.meta.url), 'utf8');
    for (const banned of ['Date', 'Math.random', 'performance', 'crypto', 'process']) {
      expect(src).not.toContain(banned);
    }
  });
});
