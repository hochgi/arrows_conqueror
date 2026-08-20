/**
 * Scaffolding for the losing-conditions suite (P36).
 *
 * Two things the shared `support.ts` cannot express, and both are the point of
 * this packet:
 *
 * 1. **More than two seats.** `PLAYERS` there is `[A, B]`, and the defect P36
 *    fixes is a two-player rule applied to a six-seat match. Everything here
 *    takes an explicit seat list.
 * 2. **Which arrows are shares.** A *share* is a spawner-border arrow held as
 *    territory (§9), so "owns territory but no share" is only sayable once a
 *    test knows which arrows border an **authored** spawner. {@link aBoard} asks
 *    the port for both halves — the share arrows and the bare ones — so no test
 *    hardcodes an adjacency and the same test runs on either fixture.
 *
 * Same two standing rules as `support.ts`: states are hand-authored and boards
 * are not, and a setup failure throws a plain `Error` so it can never be
 * mistaken for a rule failure.
 *
 * @see docs/spec/losing-conditions/losing-conditions.md
 */

import { endTurn, mintPlayerId } from '@conquarrow/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Group,
  MergeOverride,
  Move,
  PlayerId,
  Rational,
  RulesPort,
  Spawner,
  VertexId,
} from '@conquarrow/contracts';
import { orderedBorders } from '../src/economy';
import { compareArrows } from '../src/order';
import { headsOf, isLost, shareCountOf, territoryCountOf } from '../src/victory';
import { A, B, MINIMAL_DIAMETER, allArrows, onBoard } from './support';
import type { Table } from './support';

export const C: PlayerId = mintPlayerId('C');
export const D: PlayerId = mintPlayerId('D');
export const E: PlayerId = mintPlayerId('E');
export const F: PlayerId = mintPlayerId('F');

/** The six seats a hot-seat match can hold (§8). */
export const SIX: readonly PlayerId[] = [A, B, C, D, E, F];
/** The three-seat Background of the core feature. */
export const THREE: readonly PlayerId[] = [A, B, C];

// ── the board, split into shares and bare ground ──────────────────────────────

export interface Ground {
  readonly geometry: GeometryPort;
  readonly rules: RulesPort;
  /** Vertices carrying an authored spawner, in a deterministic order. */
  readonly vertices: readonly VertexId[];
  /** Every border arrow of {@link vertices} — the arrows that *are* shares. */
  readonly shares: readonly ArrowId[];
  /** Arrows bordering none of {@link vertices} — territory that pays nothing. */
  readonly bare: readonly ArrowId[];
}

/**
 * A fixture board with `spawnerCount` vertices chosen, and its arrows split into
 * shares and bare ground.
 *
 * Only the chosen vertices ever appear in `state.spawners`, so an arrow in
 * {@link Ground.bare} carries no share however many lattice vertices it borders.
 * Both halves come back in `compareArrows` order, because a test that picked
 * `bare[0]` off an unordered walk would drift the moment the port's enumeration
 * changed (ADR 0001).
 */
export const aBoard = (spawnerCount = 1): Ground => {
  const table: Table = onBoard();
  const arrows = allArrows(table.geometry, MINIMAL_DIAMETER);
  const seen = new Set<string>();
  const vertices: VertexId[] = [];
  for (const arrow of [...arrows].toSorted(compareArrows)) {
    for (const vertex of table.geometry.flankVertices(arrow)) {
      if (seen.has(String(vertex))) continue;
      seen.add(String(vertex));
      vertices.push(vertex);
    }
  }
  // Vertices with **disjoint** border sets, so `spawnerCount` spawners really do
  // yield `3 * spawnerCount` distinct shares. On `minimal` (`K7`) neighbouring
  // vertices share arrows freely, so this is a search rather than a slice.
  const chosen: VertexId[] = [];
  const taken = new Set<string>();
  for (const vertex of vertices) {
    if (chosen.length === spawnerCount) break;
    const borders = orderedBorders(table.geometry, vertex);
    if (borders.length !== 3) continue;
    if (borders.some((arrow) => taken.has(String(arrow)))) continue;
    for (const arrow of borders) taken.add(String(arrow));
    chosen.push(vertex);
  }
  if (chosen.length !== spawnerCount) {
    throw new Error(
      `setup: the board offered fewer than ${String(spawnerCount)} vertices with disjoint borders`,
    );
  }
  const shares = chosen.flatMap((v) => orderedBorders(table.geometry, v)).toSorted(compareArrows);
  const bare = arrows.filter((arrow) => !shares.includes(arrow)).toSorted(compareArrows);
  if (shares.length !== spawnerCount * 3) {
    throw new Error('setup: a spawner vertex did not border exactly three arrows');
  }
  return { geometry: table.geometry, rules: table.rules, vertices: chosen, shares, bare };
};

/** One of a ground's share arrows, index-checked. */
export const shareArrow = (ground: Ground, index: number): ArrowId => {
  const arrow = ground.shares[index];
  if (arrow === undefined) throw new Error(`setup: no share arrow ${String(index)}`);
  return arrow;
};

/** One of a ground's bare (share-free) arrows, index-checked. */
export const bareArrow = (ground: Ground, index: number): ArrowId => {
  const arrow = ground.bare[index];
  if (arrow === undefined) throw new Error(`setup: no bare arrow ${String(index)}`);
  return arrow;
};

/**
 * The lowest-sorting bare arrow that is none of `avoid` — a second holding well
 * clear of whatever the scenario is doing.
 *
 * Needed because a scenario that also asks the *port* for arrows (a step's exit,
 * a point's in-arrows) can collide with `bare[0]`, and a head that lands on an
 * unintended arrow turns a losing test into a combat test.
 */
export const bareAwayFrom = (ground: Ground, avoid: readonly ArrowId[]): ArrowId => {
  const found = ground.bare.find((arrow) => !avoid.includes(arrow));
  if (found === undefined) throw new Error('setup: every bare arrow is in use');
  return found;
};

export const aVertex = (ground: Ground, index = 0): VertexId => {
  const vertex = ground.vertices[index];
  if (vertex === undefined) throw new Error(`setup: no spawner vertex ${String(index)}`);
  return vertex;
};

// ── authoring a many-seat state ───────────────────────────────────────────────

export interface Placement {
  readonly arrow: ArrowId;
  readonly owner: PlayerId;
  readonly heads: number;
  readonly spent?: number;
  readonly speedOverride?: MergeOverride;
}

export interface Held {
  readonly arrow: ArrowId;
  readonly owner: PlayerId;
}

export interface SeatBoard {
  readonly players?: readonly PlayerId[];
  readonly activePlayer?: PlayerId;
  readonly groups?: readonly Placement[];
  readonly trails?: readonly (readonly [PlayerId, readonly ArrowId[]])[];
  readonly territory?: readonly Held[];
  readonly accumulators?: readonly (readonly [ArrowId, Rational])[];
  readonly spawners?: readonly (readonly [VertexId, Spawner])[];
  readonly starvationStreaks?: readonly (readonly [PlayerId, number])[];
  readonly dominationN?: number;
  readonly winner?: PlayerId;
}

const groupOf = (p: Placement): Group => ({
  owner: p.owner,
  heads: p.heads,
  spent: p.spent ?? 0,
  ...(p.speedOverride === undefined ? {} : { speedOverride: p.speedOverride }),
});

/**
 * A state with as many seats as the scenario names.
 *
 * `activePlayer` defaults to `players[0]`, so {@link closeRound} lands exactly
 * one full-round boundary per call.
 */
export const seatState = (board: SeatBoard = {}): GameState => {
  const players = board.players ?? THREE;
  const first = players[0];
  if (first === undefined) throw new Error('setup: a state needs at least one seat');
  return {
    players,
    activePlayer: board.activePlayer ?? first,
    groups: new Map((board.groups ?? []).map((p) => [p.arrow, groupOf(p)] as const)),
    trails: new Map(
      (board.trails ?? [])
        .map(([player, arrows]) => [player, new Set(arrows)] as const)
        .filter(([, arrows]) => arrows.size > 0),
    ),
    territory: new Map((board.territory ?? []).map((t) => [t.arrow, t.owner] as const)),
    accumulators: new Map(board.accumulators ?? []),
    spawners: new Map(board.spawners ?? []),
    starvationStreaks: new Map(board.starvationStreaks ?? []),
    dominationN: board.dominationN ?? 5,
    winner: board.winner,
  };
};

/** Territory authored as a plain list of arrows for one owner. */
export const held = (arrows: readonly ArrowId[], owner: PlayerId): readonly Held[] =>
  arrows.map((arrow) => ({ arrow, owner }));

// ── closing rounds ───────────────────────────────────────────────────────────

/**
 * One full round: `players.length` end-turns, so the chair returns to
 * `players[0]` exactly once (§7 / §11 item 41 boundary).
 *
 * Every seat is handed the chair, lost or not — that is the *pass, never skip*
 * rule, and closing a round any other way would test a rotation the engine does
 * not have.
 */
export const closeRound = (rules: RulesPort, state: GameState): GameState => {
  if (state.activePlayer !== state.players[0]) {
    throw new Error('setup: closeRound expects the chair to be with players[0]');
  }
  let next = state;
  for (let i = 0; i < state.players.length; i += 1) {
    next = rules.apply(next, endTurn());
  }
  return next;
};

/**
 * End turns until the chair comes back to `players[0]` — the boundary, wherever
 * in the rotation the scenario happened to leave off.
 *
 * What a scenario that ends mid-round needs: "a seat that loses its last
 * territory may still take the remaining turns of that round. It cannot take a
 * turn in the *next* round."
 */
export const closeRoundFrom = (rules: RulesPort, state: GameState): GameState => {
  let next = rules.apply(state, endTurn());
  for (let i = 0; i < state.players.length; i += 1) {
    if (next.activePlayer === next.players[0]) return next;
    next = rules.apply(next, endTurn());
  }
  throw new Error('setup: the chair never came back to players[0]');
};

export const closeRounds = (rules: RulesPort, state: GameState, rounds: number): GameState => {
  let next = state;
  for (let i = 0; i < rounds; i += 1) next = closeRound(rules, next);
  return next;
};

/** The move list `closeRound` plays, for a replay record. */
export const roundMoves = (players: readonly PlayerId[]): readonly Move[] =>
  players.map(() => endTurn());

// ── reading a seat ───────────────────────────────────────────────────────────

export const streakOf = (state: GameState, player: PlayerId): number =>
  state.starvationStreaks.get(player) ?? 0;

export const headsHeldBy = (state: GameState, player: PlayerId): number => headsOf(state, player);

export const landHeldBy = (state: GameState, player: PlayerId): readonly string[] =>
  [...state.territory.entries()]
    .filter(([, owner]) => owner === player)
    .map(([arrow]) => String(arrow))
    .toSorted();

export const trailHeldBy = (state: GameState, player: PlayerId): readonly string[] =>
  [...(state.trails.get(player) ?? [])].map(String).toSorted();

export const stacksHeldBy = (
  state: GameState,
  player: PlayerId,
): readonly { arrow: string; heads: number }[] =>
  [...state.groups.entries()]
    .filter(([, group]) => group.owner === player)
    .map(([arrow, group]) => ({ arrow: String(arrow), heads: group.heads }))
    .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1));

/** Everything one seat holds — the projection *"unchanged"* means. */
export const holdingsOf = (
  state: GameState,
  player: PlayerId,
): {
  heads: number;
  stacks: readonly { arrow: string; heads: number }[];
  trail: readonly string[];
  land: readonly string[];
} => ({
  heads: headsOf(state, player),
  stacks: stacksHeldBy(state, player),
  trail: trailHeldBy(state, player),
  land: landHeldBy(state, player),
});

/** Seats the derived predicate calls lost, in `state.players` order. */
export const lostSeats = (
  state: GameState,
  geometry: GeometryPort,
): readonly string[] => state.players.filter((p) => isLost(state, p, geometry)).map(String);

/** Seats still playing, in `state.players` order. */
export const livingSeats = (
  state: GameState,
  geometry: GeometryPort,
): readonly string[] => state.players.filter((p) => !isLost(state, p, geometry)).map(String);

/** The three readings the decided table is written over (§9). */
export const readingsOf = (
  state: GameState,
  player: PlayerId,
  geometry: GeometryPort,
): { territory: number; shares: number; heads: number } => ({
  territory: territoryCountOf(state, player),
  shares: shareCountOf(state, player, geometry),
  heads: headsOf(state, player),
});

/** Whether an arrow is nobody's closed ground. */
export const isUnowned = (state: GameState, arrow: ArrowId): boolean =>
  !state.territory.has(arrow);

export const accumulatorOn = (
  state: GameState,
  arrow: ArrowId,
): { num: number; den: number } => {
  const value = state.accumulators.get(arrow);
  return value === undefined ? { num: 0, den: 1 } : { num: value.num, den: value.den };
};

export const phaseOf = (state: GameState, vertex: VertexId): number => {
  const spawner = state.spawners.get(vertex);
  if (spawner === undefined) throw new Error('setup: no spawner on that vertex');
  return spawner.phase;
};

export { A, B };
