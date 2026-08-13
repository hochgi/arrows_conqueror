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

import { makeFixture, MINIMAL } from '@conquarrow/geometry-fixtures';
import { makeTiling } from '@conquarrow/geometry-tiling';
import type { BoardDescription } from '@conquarrow/geometry-fixtures';
import { chord, chordsCross, chordsInterleave, mintPlayerId } from '@conquarrow/contracts';
import type {
  ArrowId,
  Chord,
  GameState,
  GeometryPort,
  Group,
  MergeOverride,
  PlayerId,
  PointId,
  Rational,
  RulesPort,
  Spawner,
  StepMove,
  Traversal,
  VertexId,
} from '@conquarrow/contracts';
import { makeRules } from '../src/index';

export const A: PlayerId = mintPlayerId('A');
export const B: PlayerId = mintPlayerId('B');
export const PLAYERS: readonly PlayerId[] = [A, B];

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
  /** Per-arrow accumulators (P08). Absent entries are zero. */
  readonly accumulators?: readonly (readonly [ArrowId, Rational])[];
  /** Authored spawners (P08). */
  readonly spawners?: readonly (readonly [VertexId, Spawner])[];
  readonly dominationStreak?: number;
  readonly dominationHolder?: PlayerId;
  readonly dominationN?: number;
  readonly winner?: PlayerId;
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
  accumulators: new Map(ground.accumulators ?? []),
  spawners: new Map(ground.spawners ?? []),
  dominationStreak: ground.dominationStreak ?? 0,
  dominationHolder: ground.dominationHolder,
  dominationN: ground.dominationN ?? 5,
  winner: ground.winner,
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
  trails: readonly { player: string; arrows: readonly string[] }[];
  territory: readonly { arrow: string; owner: string }[];
  accumulators: readonly { arrow: string; num: number; den: number }[];
  spawners: readonly { vertex: string; num: number; den: number; phase: number }[];
  dominationStreak: number;
  dominationHolder: string | undefined;
  dominationN: number;
  winner: string | undefined;
} => ({
  activePlayer: state.activePlayer,
  players: [...state.players],
  groups: [...state.groups.entries()]
    .map(([arrow, group]) => ({ arrow: String(arrow), ...group, owner: String(group.owner) }))
    .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
  trails: [...state.trails.entries()]
    .map(([player, arrows]) => ({
      player: String(player),
      arrows: [...arrows].map(String).toSorted(),
    }))
    .toSorted((left, right) => (left.player < right.player ? -1 : 1)),
  territory: [...state.territory.entries()]
    .map(([arrow, owner]) => ({ arrow: String(arrow), owner: String(owner) }))
    .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
  accumulators: [...state.accumulators.entries()]
    .map(([arrow, r]) => ({ arrow: String(arrow), num: r.num, den: r.den }))
    .toSorted((left, right) => (left.arrow < right.arrow ? -1 : 1)),
  spawners: [...state.spawners.entries()]
    .map(([vertex, s]) => ({
      vertex: String(vertex),
      num: s.force.num,
      den: s.force.den,
      phase: s.phase,
    }))
    .toSorted((left, right) => (left.vertex < right.vertex ? -1 : 1)),
  dominationStreak: state.dominationStreak,
  dominationHolder: state.dominationHolder === undefined ? undefined : String(state.dominationHolder),
  dominationN: state.dominationN,
  winner: state.winner === undefined ? undefined : String(state.winner),
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

export { MINIMAL, SPACIOUS } from '@conquarrow/geometry-fixtures';
export type { ArrowId, Chord, GameState, PlayerId, PointId, Traversal };

/** Undirected diameters of the two fixture boards — a test-author fact (P02). */
export const MINIMAL_DIAMETER = 1;
export const SPACIOUS_DIAMETER = 2;

// ── the generated tiling ──────────────────────────────────────────────────────

/**
 * The **generated** board and the rules over it.
 *
 * P05b is the first packet that cannot use a fixture (P02's finiteness measurement,
 * SPEC §11 items 4, 30 and 36): *enclosed* means **cannot reach infinity**, and a
 * finite board has no infinity to fail to reach. Every closure and fill scenario runs
 * here; the P05 suites stay on the fixtures, where a failure prints.
 */
export const onTiling = (): Table => {
  const geometry = makeTiling();
  return { geometry, rules: makeRules(geometry) };
};

/** Territory authored as a plain list — the shape `Ground` wants. */
export const owned = (
  arrows: readonly ArrowId[],
  owner: PlayerId,
): readonly { readonly arrow: ArrowId; readonly owner: PlayerId }[] =>
  arrows.map((arrow) => ({ arrow, owner }));

/** A claim's two halves as sorted strings, so an assertion compares contents. */
export const claimKeys = (
  claim: { readonly path: readonly ArrowId[]; readonly enclosed: readonly ArrowId[] },
): { path: readonly string[]; enclosed: readonly string[] } => ({
  path: claim.path.map(String).toSorted(),
  enclosed: claim.enclosed.map(String).toSorted(),
});

/**
 * A directed cycle of three arrows around one vertex, on the tiling.
 *
 * §11 item 16: the lattice triangle is the *minimum enclosable territory*, and it
 * encloses **zero** tiles — its three arrows are the ring. Searched through the port
 * rather than built from a lattice coordinate, so the test never learns which board it
 * got (P05b D9).
 */
export const aTriangle = (geometry: GeometryPort): readonly [ArrowId, ArrowId, ArrowId] => {
  const seed = geometry.seedPoint();
  for (const a of geometry.outArrows(seed)) {
    for (const b of exitsFrom(geometry, a)) {
      for (const c of exitsFrom(geometry, b)) {
        if (exitsFrom(geometry, c).includes(a)) return [a, b, c];
      }
    }
  }
  throw new Error('setup: the tiling offered no directed 3-cycle at its seed point');
};

/**
 * A run of `length` arrows head-to-tail from the tiling's seed, and the territory
 * arrow that feeds it — the ordinary *depart, wander, come home* shape.
 *
 * Returns the departure territory arrow separately because a closure needs one: the
 * trail must leave ground the player already owns for the walk to have a root there.
 */
export const aRunFromHome = (
  geometry: GeometryPort,
  length: number,
): { readonly home: ArrowId; readonly run: readonly ArrowId[] } => {
  const home = firstOf(geometry.inArrows(geometry.seedPoint()), 'in-arrow at the seed point');
  return { home, run: pathFrom(geometry, anExitFrom(geometry, home), length) };
};

/**
 * A ring of arrows with at least one arrow strictly inside it, plus an arrow far
 * outside — the shape every positive fill scenario needs.
 *
 * Deliberately **not** built from a lattice coordinate: the rules core receives ids
 * from the port and passes them back (P01 D1), and a test that computed a hexagon from
 * `cellArrow` would be testing the tiling's arithmetic rather than the fill. So the
 * ring is grown through the port, and the scenario asserts against whatever it found.
 *
 * Girth is 3, and a 3-cycle rings nothing (§11 item 16). The shortest ring with an
 * inside is a directed 6-cycle; the interior is arrows whose two endpoints are both
 * ring points but which are not on the ring.
 */
export const aRingWithAnInside = (
  geometry: GeometryPort,
): {
  readonly wall: readonly ArrowId[];
  readonly inside: ArrowId;
  readonly interior: readonly ArrowId[];
  readonly far: ArrowId;
} => {
  const start = pick(geometry.outArrows(geometry.seedPoint()), 0);
  const exits = (a: ArrowId): readonly ArrowId[] => exitsFrom(geometry, a);

  const ring = ((): readonly ArrowId[] | undefined => {
    const walk = (path: readonly ArrowId[]): readonly ArrowId[] | undefined => {
      const last = arrowAt(path, path.length - 1);
      if (path.length === 6) return exits(last).includes(start) ? path : undefined;
      for (const next of exits(last)) {
        if (path.includes(next)) continue;
        const found = walk([...path, next]);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    return walk([start]);
  })();
  if (ring === undefined) {
    throw new Error('setup: the tiling offered no directed 6-cycle from its seed point');
  }

  const points = new Set(
    ring.flatMap((a) => [String(geometry.origin(a)), String(geometry.target(a))]),
  );
  const inside = [...new Set(ring.flatMap((a) => geometry.outArrows(geometry.target(a))))]
    .filter((a) => !ring.includes(a))
    .filter(
      (a) => points.has(String(geometry.origin(a))) && points.has(String(geometry.target(a))),
    )
    .toSorted((l, r) => (String(l) < String(r) ? -1 : 1));
  const first = inside[0];
  if (first === undefined) throw new Error('setup: that ring has no interior arrow');

  return {
    wall: ring,
    inside: first,
    interior: inside,
    far: arrowAt(pathFrom(geometry, start, 20, ring), 19),
  };
};

/**
 * An arrow that touches the ring's points from *outside* it — neither wall nor
 * interior.
 *
 * What the "a walk may pass a point it does not cross" scenario needs: it shares points
 * with the wall, so a fill that blocked every transit at a wall point would seal it in
 * along with the pocket, and §2's *turning aside* case would be silently gone.
 */
export const justOutside = (
  geometry: GeometryPort,
  ring: { readonly wall: readonly ArrowId[]; readonly interior: readonly ArrowId[] },
): ArrowId => {
  for (const arrow of ring.wall) {
    for (const point of [geometry.origin(arrow), geometry.target(arrow)]) {
      for (const other of [...geometry.inArrows(point), ...geometry.outArrows(point)]) {
        if (!ring.wall.includes(other) && !ring.interior.includes(other)) return other;
      }
    }
  }
  throw new Error('setup: every arrow touching that ring is the ring or its inside');
};

/**
 * An arrow whose every neighbour is territory — the saturated point of fill.core.
 *
 * Both its endpoints have all six slots held, so no walk can transit at all and
 * *enclosed* is arithmetic rather than a rule.
 */
export const anArrowWithNoRouteOut = (
  geometry: GeometryPort,
): { readonly arrow: ArrowId; readonly wall: readonly ArrowId[] } => {
  const arrow = anArrow(geometry);
  const wall = [geometry.origin(arrow), geometry.target(arrow)]
    .flatMap((point) => [...geometry.inArrows(point), ...geometry.outArrows(point)])
    .filter((other) => other !== arrow);
  return { arrow, wall: [...new Set(wall)] };
};

/**
 * A thick annulus of arrows around the tiling's seed — a wall no walk crosses.
 *
 * `window(k).arrows` is every arrow with an endpoint within `k` of the centre, so the
 * band `window(r + 1) \ window(r - 1)` holds exactly the arrows whose nearest endpoint
 * is `r` or `r + 1`. An arrow inside it has an endpoint at `r - 1` or nearer, one
 * outside has none nearer than `r + 2`, and two arrows that share a point cannot be
 * three apart — so inside and outside never touch and the band seals. Asked of the
 * port, so no test learns a coordinate (P05b D9).
 */
export const aSealedBand = (geometry: GeometryPort, radius: number): readonly ArrowId[] => {
  const centre = geometry.seedPoint();
  const inner = new Set(geometry.window(centre, radius - 1).arrows);
  return geometry.window(centre, radius + 1).arrows.filter((arrow) => !inner.has(arrow));
};

/**
 * An arrow well clear of `near` whose identifier sorts **below** all of them.
 *
 * A second holding somewhere else on the board, in the position that used to drag a
 * sweep's window off the closure: `compareArrows` orders on the identifier's string
 * form, so the lowest-sorting arrow of a ground set is the one a single-window sweep
 * centred itself on. Ids are compared, never parsed (P01 D1).
 */
export const aDistantHolding = (
  geometry: GeometryPort,
  near: readonly ArrowId[],
): ArrowId => {
  const floor = near.map(String).toSorted()[0] ?? '';
  const shielded = new Set(
    geometry.window(geometry.origin(arrowAt(near, 0)), 8).arrows.map(String),
  );
  const found = geometry
    .window(geometry.seedPoint(), 20)
    .arrows.find((arrow) => String(arrow) < floor && !shielded.has(String(arrow)));
  if (found === undefined) throw new Error('setup: no distant arrow sorts below that claim');
  return found;
};

/**
 * A GeometryPort that counts vertex reads — used to assert §11 item 34 (fill and
 * closure enumerate no vertex).
 */
export const countingVertices = (
  geometry: GeometryPort,
): { readonly geometry: GeometryPort; readonly vertexReads: () => number } => {
  let reads = 0;
  const wrapped: GeometryPort = {
    seedPoint: () => geometry.seedPoint(),
    window: (centre, radius) => {
      const win = geometry.window(centre, radius);
      // The window *lists* vertices for completeness of the port, but reading that
      // list is not enumerating them as ownership — only flankVertices / borderArrows
      // are the queries fill must not make. Count those.
      return win;
    },
    inArrows: (point) => geometry.inArrows(point),
    outArrows: (point) => geometry.outArrows(point),
    origin: (arrow) => geometry.origin(arrow),
    target: (arrow) => geometry.target(arrow),
    flankVertices: (arrow) => {
      reads += 1;
      return geometry.flankVertices(arrow);
    },
    borderArrows: (vertex) => {
      reads += 1;
      return geometry.borderArrows(vertex);
    },
    slotOf: (point, arrow) => geometry.slotOf(point, arrow),
  };
  return { geometry: wrapped, vertexReads: () => reads };
};
