/**
 * Test-only scaffolding for the movement suite.
 *
 * Two rules govern everything here:
 *
 * 1. **States are hand-authored, boards are not** (P04 D8). There is no
 *    match-setup constructor in this packet, so a test places heads on arrows it
 *    asked the *port* for. No test hardcodes an adjacency; `exitsFrom` and
 *    friends ask `GeometryPort`, so the same test passes against a fixture board
 *    or the generated tiling.
 * 2. **A setup failure must not look like a rule failure.** Every helper that
 *    cannot find what a scenario needs throws a plain `Error` naming the setup —
 *    never a `ContractViolation`, which is what the rules themselves throw.
 *
 * The boards are the P02 fixtures: `minimal` (7 points, `K₇`) and `spacious`
 * (8 points, diameter 2). Movement is local, so a fixture hosts every rule in
 * this packet (P02 measurement 2).
 */

import { makeFixture, MINIMAL } from '@arrows/geometry-fixtures';
import type { BoardDescription } from '@arrows/geometry-fixtures';
import { mintPlayerId } from '@arrows/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Group,
  MergeOverride,
  PlayerId,
  PointId,
  RulesPort,
  StepMove,
} from '@arrows/contracts';
import { makeRules } from '../src/index';

export const A: PlayerId = mintPlayerId('A');
export const B: PlayerId = mintPlayerId('B');
export const PLAYERS: readonly [PlayerId, PlayerId] = [A, B];

/** A board and the rules over it. */
export interface Table {
  readonly geometry: GeometryPort;
  readonly rules: RulesPort;
}

export const onBoard = (description: BoardDescription = MINIMAL): Table => {
  const geometry = makeFixture(description);
  return { geometry, rules: makeRules(geometry) };
};

// ── authoring a state ─────────────────────────────────────────────────────────

/** One arrow's worth of authored occupancy. `spent` defaults to 0. */
export interface Placement {
  readonly arrow: ArrowId;
  readonly owner: PlayerId;
  readonly heads: number;
  readonly spent?: number;
  readonly speedOverride?: MergeOverride;
}

const groupOf = (p: Placement): Group => ({
  owner: p.owner,
  heads: p.heads,
  spent: p.spent ?? 0,
  ...(p.speedOverride === undefined ? {} : { speedOverride: p.speedOverride }),
});

export const stateOf = (
  placements: readonly Placement[],
  activePlayer: PlayerId = A,
): GameState => ({
  players: PLAYERS,
  activePlayer,
  groups: new Map(placements.map((p) => [p.arrow, groupOf(p)] as const)),
});

// ── observing a state ─────────────────────────────────────────────────────────

/** Heads standing on an arrow — 0 when it is empty. */
export const headsOn = (state: GameState, arrow: ArrowId): number =>
  state.groups.get(arrow)?.heads ?? 0;

/** Who holds an arrow, or `undefined` when nobody does. */
export const ownerOf = (state: GameState, arrow: ArrowId): PlayerId | undefined =>
  state.groups.get(arrow)?.owner;

export const isEmpty = (state: GameState, arrow: ArrowId): boolean =>
  !state.groups.has(arrow);

/** The group's `spent`. Throws a setup error when nothing stands there. */
export const spentOn = (state: GameState, arrow: ArrowId): number => {
  const group = state.groups.get(arrow);
  if (group === undefined) throw new Error(`setup: expected a group on ${String(arrow)}`);
  return group.spent;
};

export const totalHeads = (state: GameState): number =>
  [...state.groups.values()].reduce((sum, group) => sum + group.heads, 0);

/**
 * A comparable, order-independent picture of a whole state.
 *
 * Sorted by arrow id on purpose: the *content* of a state is what a golden may
 * pin, while the order a map happened to be built in is phase 3's business. The
 * one test that cares about map order compares two runs against each other
 * instead (see the insertion-order property).
 */
export const snapshot = (
  state: GameState,
): {
  activePlayer: string;
  players: readonly string[];
  groups: readonly { arrow: string; owner: string; heads: number; spent: number; speedOverride?: MergeOverride }[];
} => ({
  activePlayer: state.activePlayer,
  players: [...state.players],
  groups: [...state.groups.entries()]
    .map(([arrow, group]) => ({ arrow: String(arrow), ...group, owner: String(group.owner) }))
    .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
});

/** The legal steps out of one arrow, as the port reports them. */
export const stepsFrom = (
  { rules }: Table,
  state: GameState,
  arrow: ArrowId,
): readonly StepMove[] =>
  rules.legalMoves(state).filter((m): m is StepMove => m.kind === 'step' && m.from === arrow);

// ── asking the board, never assuming it ───────────────────────────────────────

const firstOf = <T>(items: readonly T[], what: string): T => {
  const [head] = items;
  if (head === undefined) throw new Error(`setup: the board offered no ${what}`);
  return head;
};

const nth = <T>(items: readonly T[], index: number, what: string): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`setup: the board offered no ${String(index)}th ${what}`);
  return item;
};

/** One arrow of a path the board handed back, with the index checked. */
export const arrowAt = (path: readonly ArrowId[], index: number): ArrowId =>
  nth(path, index, 'path arrow');

/** A deterministic arrow to start a scenario from. */
export const anArrow = (geometry: GeometryPort): ArrowId =>
  firstOf(geometry.outArrows(geometry.seedPoint()), 'out-arrow at its seed point');

/** The out-arrows of an arrow's target — every exit a step from it may take (§2). */
export const exitsFrom = (geometry: GeometryPort, arrow: ArrowId): readonly ArrowId[] =>
  geometry.outArrows(geometry.target(arrow));

export const anExitFrom = (geometry: GeometryPort, arrow: ArrowId): ArrowId =>
  firstOf(exitsFrom(geometry, arrow), `exit from ${String(arrow)}`);

/** Two distinct exits from one arrow — a fork's worth (§4). */
export const twoExitsFrom = (
  geometry: GeometryPort,
  arrow: ArrowId,
): readonly [ArrowId, ArrowId] => {
  const exits = exitsFrom(geometry, arrow);
  return [nth(exits, 0, 'exit'), nth(exits, 1, 'exit')];
};

/** Every arrow of a board small enough to be its own window. */
export const allArrows = (geometry: GeometryPort, diameter: number): readonly ArrowId[] =>
  geometry.window(geometry.seedPoint(), diameter).arrows;

/**
 * An arrow that is **not** an exit from `arrow` and is not `arrow` itself — the
 * against-the-grain step §2 forbids.
 */
export const notAnExitFrom = (
  geometry: GeometryPort,
  arrow: ArrowId,
  diameter: number,
): ArrowId => {
  const exits = new Set(exitsFrom(geometry, arrow));
  const found = allArrows(geometry, diameter).find(
    (candidate) => candidate !== arrow && !exits.has(candidate),
  );
  if (found === undefined) throw new Error('setup: every arrow on this board is an exit');
  return found;
};

/**
 * `length` arrows, each an exit from the one before it, all distinct and all
 * clear of `avoid` — the path a stack walks when it spends several steps.
 */
export const pathFrom = (
  geometry: GeometryPort,
  start: ArrowId,
  length: number,
  avoid: readonly ArrowId[] = [],
): readonly ArrowId[] => {
  const path: ArrowId[] = [start];
  while (path.length < length) {
    const here = nth(path, path.length - 1, 'path arrow');
    const next = exitsFrom(geometry, here).find(
      (exit) => !path.includes(exit) && !avoid.includes(exit),
    );
    if (next === undefined) throw new Error('setup: no unvisited exit to extend the path');
    path.push(next);
  }
  return path;
};

/**
 * Two paths with no arrow in common, so two groups can walk them without ever
 * meeting — what interleaved stepping needs in order to be about allowance and
 * nothing else.
 */
export const twoDisjointPaths = (
  geometry: GeometryPort,
  lengths: readonly [number, number],
  diameter: number,
): readonly [readonly ArrowId[], readonly ArrowId[]] => {
  const [firstLength, secondLength] = lengths;
  const first = pathFrom(geometry, anArrow(geometry), firstLength);
  for (const start of allArrows(geometry, diameter)) {
    if (first.includes(start)) continue;
    try {
      return [first, pathFrom(geometry, start, secondLength, first)];
    } catch {
      continue;
    }
  }
  throw new Error('setup: no second path disjoint from the first');
};

/**
 * Two arrows sharing one exit: both arrive at the same point, so both may step
 * onto the same destination. What the "a later arrival must not un-bar a barred
 * stack" scenario needs (§3).
 */
export const twoSourcesOneDestination = (
  geometry: GeometryPort,
): { readonly big: ArrowId; readonly small: ArrowId; readonly dest: ArrowId } => {
  const junction: PointId = geometry.target(anArrow(geometry));
  const ins = geometry.inArrows(junction);
  return {
    big: nth(ins, 0, 'in-arrow'),
    small: nth(ins, 1, 'in-arrow'),
    dest: firstOf(geometry.outArrows(junction), 'out-arrow'),
  };
};

export { MINIMAL, SPACIOUS } from '@arrows/geometry-fixtures';
export type { ArrowId, GameState, PlayerId };

/** Undirected diameters of the two fixture boards — a test-author fact (P02). */
export const MINIMAL_DIAMETER = 1;
export const SPACIOUS_DIAMETER = 2;
