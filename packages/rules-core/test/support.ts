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
import { chord, chordsCross, chordsInterleave, mintPlayerId } from '@arrows/contracts';
import type {
  ArrowId,
  Chord,
  GameState,
  GeometryPort,
  Group,
  MergeOverride,
  PlayerId,
  PointId,
  RulesPort,
  StepMove,
  Traversal,
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

/**
 * Trail and territory, authored separately from occupancy.
 *
 * Deliberately *not* derived from the placements. P05 D2 says the arrow a head
 * stands on is trail, but that is a consequence of stepping — a test that wants a
 * head on unmarked ground (every P04 scenario does) must be able to say so, and a
 * test about trails must be able to author a headless stretch (§6.1a). Deriving
 * either from the other would make both unsayable.
 */
export interface Ground {
  /** Arrows in each player's trail. Overlap between players is legal (P05 D1). */
  readonly trail?: Readonly<Partial<Record<'A' | 'B', readonly ArrowId[]>>>;
  /** Arrows of closed ground, one owner each. */
  readonly territory?: readonly { readonly arrow: ArrowId; readonly owner: PlayerId }[];
}

const trailsOf = (ground: Ground): GameState['trails'] =>
  new Map(
    ([['A', A], ['B', B]] as const)
      .map(([key, player]) => [player, new Set(ground.trail?.[key] ?? [])] as const)
      .filter(([, arrows]) => arrows.size > 0),
  );

export const stateOf = (
  placements: readonly Placement[],
  activePlayer: PlayerId = A,
  ground: Ground = {},
): GameState => ({
  players: PLAYERS,
  activePlayer,
  groups: new Map(placements.map((p) => [p.arrow, groupOf(p)] as const)),
  trails: trailsOf(ground),
  territory: new Map((ground.territory ?? []).map((t) => [t.arrow, t.owner] as const)),
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

// ── observing trail and territory ─────────────────────────────────────────────

/**
 * A player's trail as a **sorted** array of strings.
 *
 * Sorted so an assertion compares contents rather than the order a `Set` happened
 * to be built in — which is the ordering dependence ADR 0001 calls the realistic
 * one. The one test that cares about order compares two builds against each other.
 */
export const trailOf = (state: GameState, player: PlayerId): readonly string[] =>
  [...(state.trails.get(player) ?? [])].map(String).toSorted();

export const isTrail = (state: GameState, player: PlayerId, arrow: ArrowId): boolean =>
  state.trails.get(player)?.has(arrow) === true;

/** Who holds this arrow as closed ground, or `undefined`. */
export const territoryOf = (state: GameState, arrow: ArrowId): PlayerId | undefined =>
  state.territory.get(arrow);

/** A traversal in by `from`, out by `exit` — the geometric question, no player. */
export const via = (from: ArrowId, exit: ArrowId): Traversal => ({ from, exit });

/**
 * Chords as comparable strings, so a set of them can be asserted readably.
 *
 * `chord()` normalizes so the lower slot comes first, which is what makes two
 * structurally equal chords compare equal — so this is a faithful key and not a
 * lossy one.
 */
export const chordKeys = (chords: readonly Chord[]): readonly string[] =>
  chords.map((c) => `${String(c.a)}-${String(c.b)}`).toSorted();

/** The chord a traversal draws at the point it transits, asked of the board. */
export const chordOf = (geometry: GeometryPort, t: Traversal): Chord => {
  const point = geometry.target(t.from);
  return chord(geometry.slotOf(point, t.from), geometry.slotOf(point, t.exit));
};

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

// ── authoring a point's neighbourhood ─────────────────────────────────────────

/** One item of a list the board handed back, with the index checked. */
export const pick = <T>(items: readonly T[], index: number): T =>
  nth(items, index, 'item the board offered');

/** A deterministic point to build a branch or a crossing at. */
export const aPoint = (geometry: GeometryPort): PointId =>
  geometry.target(anArrow(geometry));

/**
 * A point and the three arrows in and three out, as the board reports them.
 *
 * Every branch, crossover and crossing scenario is authored from this rather than
 * from literal ids, so the same test runs on either fixture board — and on the
 * tiling, when P05b needs it.
 */
export const slotsAt = (
  geometry: GeometryPort,
  point: PointId,
): { readonly point: PointId; readonly ins: readonly ArrowId[]; readonly outs: readonly ArrowId[] } => ({
  point,
  ins: geometry.inArrows(point),
  outs: geometry.outArrows(point),
});

/**
 * Sort the out-arrows of `point` by how a traversal from `from` relates to
 * `against` — the three cases §2 distinguishes.
 *
 * `aside` is the *neither* case: not interleaving and not coinciding. Turning aside
 * rather than through.
 */
export const exitsByCrossing = (
  geometry: GeometryPort,
  point: PointId,
  from: ArrowId,
  against: Chord,
): {
  readonly interleaving: readonly ArrowId[];
  readonly coincidingOnly: readonly ArrowId[];
  readonly aside: readonly ArrowId[];
} => {
  const mine = geometry.slotOf(point, from);
  const interleaving: ArrowId[] = [];
  const coincidingOnly: ArrowId[] = [];
  const aside: ArrowId[] = [];
  for (const exit of geometry.outArrows(point)) {
    const ours = chord(mine, geometry.slotOf(point, exit));
    if (chordsInterleave(ours, against)) interleaving.push(exit);
    else if (chordsCross(ours, against)) coincidingOnly.push(exit);
    else aside.push(exit);
  }
  return { interleaving, coincidingOnly, aside };
};

/**
 * A point, a spine of trail through it, and a traversal that **interleaves** with
 * that spine — found by search rather than assumed.
 *
 * Whether a given (in, out) pair interleaves with another depends on the point's
 * rotation system, which is authored data and free (§11 item 29). So a test that
 * picked `ins[1]` and hoped would pass on one board and fail on the next. This
 * asks the board for a configuration that exists, deterministically: first point,
 * first pair, first hit.
 */
export const anInterleaving = (
  geometry: GeometryPort,
  diameter: number,
): {
  readonly point: PointId;
  readonly trailIn: ArrowId;
  readonly trailOut: ArrowId;
  readonly ourIn: ArrowId;
  readonly ourExit: ArrowId;
} => {
  for (const point of [...new Set(allArrows(geometry, diameter).map((a) => geometry.target(a)))]) {
    const ins = geometry.inArrows(point);
    const outs = geometry.outArrows(point);
    for (const trailIn of ins) {
      for (const trailOut of outs) {
        const theirs = chord(geometry.slotOf(point, trailIn), geometry.slotOf(point, trailOut));
        for (const ourIn of ins) {
          if (ourIn === trailIn) continue;
          for (const ourExit of outs) {
            const ours = chord(geometry.slotOf(point, ourIn), geometry.slotOf(point, ourExit));
            if (chordsInterleave(ours, theirs)) {
              return { point, trailIn, trailOut, ourIn, ourExit };
            }
          }
        }
      }
    }
  }
  throw new Error('setup: no interleaving configuration on this board');
};

/**
 * Three arrows forming a directed cycle — `a → b → c → a`.
 *
 * Girth is 3 on every conformant board (SPEC §2, §11 item 3) and §11 item 5 calls
 * this the shortest U-turn loop, so one exists; it is searched for rather than
 * constructed because which three depends on the board.
 */
export const aThreeCycle = (
  geometry: GeometryPort,
  diameter: number,
): readonly [ArrowId, ArrowId, ArrowId] => {
  for (const a of allArrows(geometry, diameter)) {
    for (const b of exitsFrom(geometry, a)) {
      for (const c of exitsFrom(geometry, b)) {
        if (exitsFrom(geometry, c).includes(a)) return [a, b, c];
      }
    }
  }
  throw new Error('setup: this board has no directed 3-cycle, so its girth is not 3');
};

export { MINIMAL, SPACIOUS } from '@arrows/geometry-fixtures';
export type { ArrowId, Chord, GameState, PlayerId, PointId, Traversal };

/** Undirected diameters of the two fixture boards — a test-author fact (P02). */
export const MINIMAL_DIAMETER = 1;
export const SPACIOUS_DIAMETER = 2;
