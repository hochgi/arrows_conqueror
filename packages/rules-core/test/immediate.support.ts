/**
 * Scaffolding for the immediate-loss suite (P37).
 *
 * Two things this adds over `losing.support.ts`, and both are what P37 is about:
 *
 * 1. **Every state a replay passes through**, not just its endpoint. Invariants 9
 *    and 10 are the item-44 chain — *some seat always owns a share*, *some seat is
 *    never lost* — and quantifying them over the endpoints only would miss the one
 *    move that briefly emptied the board. {@link statesAlong} folds a record and
 *    keeps the whole trace.
 * 2. **The reported playtest log**, replayed from the repo rather than from a
 *    download. `playtestLog` reads a committed fixture and rebuilds the opening
 *    with `makeMatch(config)` exactly as the adapter did, so the regression the
 *    packet was filed for is a test and not an anecdote.
 *
 * Same standing rules as the rest of the suite: states are hand-authored and
 * boards are not, and a setup failure throws a plain `Error` so it can never be
 * mistaken for a rule failure.
 *
 * @see docs/spec/immediate-loss/immediate-loss.md
 */

import { readFileSync } from 'node:fs';
import { endTurn, mintArrowId, movesEqual, rational, skip, step } from '@conquarrow/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  MatchConfig,
  Move,
  PlayerId,
  RulesPort,
} from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '../src/index';
import { isLost, shareCountOf } from '../src/victory';
import { A, B, C, D, aBoard, aVertex, bareArrow, held, seatState, shareArrow } from './losing.support';
import type { Ground } from './losing.support';
import { exitsFrom } from './support';

// ── the committed playtest log ────────────────────────────────────────────────

/** The move shapes an adapter-side match log writes (`packages/web/src/matchLog.ts`). */
interface LoggedMove {
  readonly kind: string;
  readonly from?: string;
  readonly exit?: string;
  readonly count?: number;
}

interface LoggedMatch {
  readonly version: number;
  readonly config: MatchConfig;
  readonly moves: readonly LoggedMove[];
  readonly winner?: string;
}

export interface PlaytestLog {
  readonly config: MatchConfig;
  readonly moves: readonly Move[];
  /** The winner the adapter recorded when the match ended. */
  readonly winner: string;
}

/**
 * The 2026-08-20 six-seat hot-seat log the packet was filed for, as moves.
 *
 * Committed under `test/fixtures/` on purpose: a test that read `~/Downloads`
 * would pass on one machine and be a missing-file error everywhere else.
 */
export const playtestLog = (): PlaytestLog => {
  const raw = readFileSync(
    new URL('./fixtures/playtest-2026-08-20-D-wins.json', import.meta.url),
    'utf8',
  );
  const parsed = JSON.parse(raw) as LoggedMatch;
  if (parsed.winner === undefined) throw new Error('setup: that log records no winner');
  return {
    config: parsed.config,
    moves: parsed.moves.map(asMove),
    winner: parsed.winner,
  };
};

const requireArrow = (raw: string | undefined, what: string): ArrowId => {
  if (raw === undefined) throw new Error(`setup: a logged move has no ${what}`);
  return mintArrowId(raw);
};

const asMove = (logged: LoggedMove): Move => {
  switch (logged.kind) {
    case 'endTurn':
      return { kind: 'endTurn' };
    case 'skip':
      return { kind: 'skip', from: requireArrow(logged.from, 'from') };
    case 'step':
      return {
        kind: 'step',
        from: requireArrow(logged.from, 'from'),
        exit: requireArrow(logged.exit, 'exit'),
        count: logged.count ?? 1,
      };
    default:
      throw new Error(`setup: a logged move has an unknown kind ${logged.kind}`);
  }
};

// ── every state a record passes through ──────────────────────────────────────

export interface Stop {
  /** Zero-based index of the move that produced this state. */
  readonly at: number;
  readonly move: Move;
  readonly state: GameState;
}

/**
 * The initial state followed by the state after each move.
 *
 * Stops at the first move `legalMoves` does not offer and reports it, rather
 * than throwing: *a lost seat is offered no move* (invariant 4) makes a refusal
 * the expected end of a log that was recorded under the old timing, and the
 * index it stops at is exactly what the regression test asserts.
 */
export const statesAlong = (
  rules: RulesPort,
  initial: GameState,
  moves: readonly Move[],
): { readonly stops: readonly Stop[]; readonly refusedAt: number | undefined } => {
  const stops: Stop[] = [];
  let state = initial;
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (move === undefined) throw new Error('setup: a hole in the move list');
    if (!offers(rules, state, move)) return { stops, refusedAt: index };
    state = rules.apply(state, move);
    stops.push({ at: index, move, state });
  }
  return { stops, refusedAt: undefined };
};

const offers = (rules: RulesPort, state: GameState, move: Move): boolean =>
  rules.legalMoves(state).some((offered) => movesEqual(offered, move));

/** The index of the first stop whose state has a winner, or `undefined`. */
export const firstWinnerAt = (stops: readonly Stop[]): number | undefined =>
  stops.find((stop) => stop.state.winner !== undefined)?.at;

// ── reading the item-44 chain off a state ────────────────────────────────────

/** Whether any seat owns at least one spawner share — invariant 9. */
export const someSeatOwnsAShare = (state: GameState, geometry: GeometryPort): boolean =>
  state.players.some((player) => shareCountOf(state, player, geometry) > 0);

/** Whether any seat is still playing — invariant 10. */
export const someSeatIsAlive = (state: GameState, geometry: GeometryPort): boolean =>
  state.players.some((player) => !isLost(state, player, geometry));

/** Every arrow bordering a spawner, whoever owns it. */
export const shareArrowsOf = (
  state: GameState,
  geometry: GeometryPort,
): ReadonlySet<ArrowId> => {
  const shares = new Set<ArrowId>();
  for (const vertex of state.spawners.keys()) {
    for (const arrow of geometry.borderArrows(vertex)) shares.add(arrow);
  }
  return shares;
};

/** Owned spawner-border arrows, as `arrow -> owner`, for a before/after compare. */
export const ownedSharesOf = (
  state: GameState,
  geometry: GeometryPort,
): ReadonlyMap<string, string> => {
  const owned = new Map<string, string>();
  for (const arrow of shareArrowsOf(state, geometry)) {
    const owner = state.territory.get(arrow);
    if (owner !== undefined) owned.set(String(arrow), String(owner));
  }
  return owned;
};

/** Seats the derived predicate calls lost, in `state.players` order. */
export const lostAlong = (
  state: GameState,
  geometry: GeometryPort,
): readonly string[] => state.players.filter((p) => isLost(state, p, geometry)).map(String);

/** Arrows this player holds, as sorted strings. */
export const landOf = (state: GameState, player: PlayerId): readonly string[] =>
  [...state.territory.entries()]
    .filter(([, owner]) => owner === player)
    .map(([arrow]) => String(arrow))
    .toSorted();

// ── a hand-authored record that loses three seats ────────────────────────────

/** An exit from `arrow` that nobody owns — a step that cannot convert itself. */
const clearExit = (ground: Ground, state: GameState, arrow: ArrowId): ArrowId => {
  const found = exitsFrom(ground.geometry, arrow).find(
    (exit) => !state.territory.has(exit) && !state.groups.has(exit),
  );
  if (found === undefined) throw new Error('setup: every exit is owned or occupied');
  return found;
};

/**
 * The record: A and B hold bare ground and heads, so they are on the starvation
 * clock; C holds bare ground and nothing else, so C goes on the first move that
 * resolves. D holds a share. The threshold is two rounds, so A and B follow at
 * the second boundary and D is left alone.
 */
export const aMatchLosingThree = (): {
  ground: Ground;
  initial: GameState;
  moves: readonly Move[];
} => {
  const ground = aBoard();
  const aStack = bareArrow(ground, 3);
  const bStack = bareArrow(ground, 4);
  const dStack = shareArrow(ground, 2);
  const initial = seatState({
    players: [A, B, C, D],
    groups: [
      { arrow: aStack, owner: A, heads: 1 },
      { arrow: bStack, owner: B, heads: 1 },
      { arrow: dStack, owner: D, heads: 2 },
    ],
    territory: [
      ...held([bareArrow(ground, 0)], A),
      ...held([bareArrow(ground, 1)], B),
      // C: territory, no share, no head — lost the moment anything resolves.
      ...held([bareArrow(ground, 2)], C),
      { arrow: dStack, owner: D },
    ],
    accumulators: [[dStack, rational(2, 3)]],
    spawners: [[aVertex(ground), { force: rational(1, 3), phase: 2 }]],
    dominationN: 2,
  });
  const aExit = clearExit(ground, initial, aStack);
  const dExit = clearExit(ground, initial, dStack);
  const moves: readonly Move[] = [
    // Round 1 — A wanders, B stands, C is passed, D pushes a head out.
    step(aStack, aExit, 1),
    endTurn(),
    skip(bStack),
    endTurn(),
    endTurn(),
    step(dStack, dExit, 1),
    endTurn(),
    // Round 2 — everyone ends. The boundary takes A and B together.
    endTurn(),
    endTurn(),
    endTurn(),
    endTurn(),
  ];
  return { ground, initial, moves };
};


// ── the one step that takes a seat's last arrow ──────────────────────────────

/**
 * A land bridge on the generated tiling: one arrow of trail, departing the
 * mover's own ground and landing back on it (§7 / P05b).
 *
 * This is the only shape that *takes* territory on one step without needing fill,
 * which is why every "the move that decides it" scenario is built on it: the
 * arrow the bridge claims can be authored as the victim's last territory, and the
 * claim changes its owner rather than clearing it.
 *
 * The tiling rather than a fixture, because closure asks *cannot reach infinity*
 * and a finite board has no infinity to fail to reach (P02 measurement, §11 item 4).
 */
export interface LandBridge {
  readonly geometry: GeometryPort;
  readonly rules: RulesPort;
  /** The mover's departure ground. */
  readonly home: ArrowId;
  /** The single trail arrow the bridge claims — author it as the victim's last. */
  readonly bridge: ArrowId;
  /** The mover's ground the bridge lands on. */
  readonly landing: ArrowId;
  /** Arrows well clear of the bridge, for holdings that must not touch it. */
  readonly far: readonly ArrowId[];
}

export const aLandBridge = (): LandBridge => {
  const geometry = makeTiling();
  const home = geometry.inArrows(geometry.seedPoint())[0];
  if (home === undefined) throw new Error('setup: the seed point has no in-arrow');
  const bridge = geometry.outArrows(geometry.target(home))[0];
  if (bridge === undefined) throw new Error('setup: no arrow leaves the home');
  const landing = geometry.outArrows(geometry.target(bridge))[0];
  if (landing === undefined) throw new Error('setup: the bridge has no landing');
  const used = new Set([home, bridge, landing].map(String));
  const far = geometry
    .window(geometry.seedPoint(), 6)
    .arrows.filter((arrow) => !used.has(String(arrow)))
    .toSorted((left, right) => (String(left) < String(right) ? 1 : -1));
  if (far.length < 4) throw new Error('setup: the board offered too few arrows clear of the bridge');
  return { geometry, rules: makeRules(geometry), home, bridge, landing, far };
};

/** One of a bridge's far arrows, index-checked. */
export const farArrow = (bridge: LandBridge, index: number): ArrowId => {
  const arrow = bridge.far[index];
  if (arrow === undefined) throw new Error(`setup: no far arrow ${String(index)}`);
  return arrow;
};

/** The step that walks the bridge and claims it. */
export const crossing = (bridge: LandBridge): Move => step(bridge.bridge, bridge.landing, 1);
