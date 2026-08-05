/**
 * `makeFixture` — a `GeometryPort` over a hand-authored finite digraph.
 *
 * SPEC §2, §7. P02 D1, D2, D5.
 *
 * The sibling of `makeTiling`: same port, same conformance suite, authored
 * rather than generated. From a board's rotation system it derives the arrow
 * graph, enumerates minimal directed 3-cycles to mint the spawner-vertex lattice,
 * validates the whole thing at construction (D2 — a malformed board fails loudly
 * where it is written, naming the offending point or arrow), and answers every
 * `GeometryPort` query.
 *
 * There is deliberately **no dependency on `@arrows/geometry-tiling`** (P02 DoD):
 * a fixture must stand entirely on `@arrows/contracts`, so that the two port
 * implementations are genuinely independent evidence for interchangeability.
 */

import { ContractViolation } from '@arrows/contracts';
import type { ArrowId, BoardWindow, GeometryPort, PointId, Slot, VertexId } from '@arrows/contracts';
import type { BoardDescription } from './boards';
import { fixtureArrow, fixturePoint, fixtureVertex } from './ids';

const reject = (message: string): never => {
  throw new ContractViolation(message);
};

/** Authored arrow name, e.g. `0>1`. */
type ArrowSpec = string;

interface ParsedArrow {
  readonly spec: ArrowSpec;
  readonly from: string;
  readonly to: string;
  readonly id: ArrowId;
}

interface BuiltBoard {
  readonly description: BoardDescription;
  /** Point labels in authored Object key order (stable for a given description). */
  readonly pointLabels: readonly string[];
  readonly pointIds: ReadonlyMap<string, PointId>;
  readonly labelOf: ReadonlyMap<PointId, string>;
  /** Six arrow specs per point, cyclic slot order. */
  readonly rotations: ReadonlyMap<string, readonly ArrowSpec[]>;
  readonly arrows: ReadonlyMap<ArrowSpec, ParsedArrow>;
  readonly arrowById: ReadonlyMap<ArrowId, ParsedArrow>;
  /** Out-arrows in cyclic (authored) order. */
  readonly outs: ReadonlyMap<string, readonly ArrowId[]>;
  /** In-arrows in cyclic (authored) order. */
  readonly ins: ReadonlyMap<string, readonly ArrowId[]>;
  readonly slotAt: ReadonlyMap<string, ReadonlyMap<ArrowSpec, Slot>>;
  /** Canonical-key → three arrow specs of the cycle. */
  readonly cycles: ReadonlyMap<string, readonly ArrowSpec[]>;
  readonly vertexByKey: ReadonlyMap<string, VertexId>;
  readonly borderByVertex: ReadonlyMap<VertexId, readonly ArrowId[]>;
  readonly flanksByArrow: ReadonlyMap<ArrowId, readonly VertexId[]>;
}

const parseSpec = (spec: string): { from: string; to: string } | undefined => {
  const sep = spec.indexOf('>');
  if (sep <= 0 || sep !== spec.lastIndexOf('>') || sep === spec.length - 1) return undefined;
  return { from: spec.slice(0, sep), to: spec.slice(sep + 1) };
};

const cycleKey = (specs: readonly ArrowSpec[]): string => [...specs].toSorted().join('|');

/**
 * Collect every construction fault, then throw once. Incidence faults in
 * particular must all be named — point-side and arrow-side of 3:1:2 co-occur on
 * every realizable small board, and the two scenarios that check them cannot
 * both pass if only the first fault is reported (P02 D2, phase-2 finding).
 */
const throwAll = (faults: readonly string[]): void => {
  if (faults.length > 0) reject(faults.join('; '));
};

const validateAndBuild = (description: BoardDescription): BuiltBoard => {
  const faults: string[] = [];
  const pointLabels = Object.keys(description.rotations);
  const declared = new Set(pointLabels);
  const rotations = new Map<string, readonly ArrowSpec[]>();

  for (const label of pointLabels) {
    const slots = description.rotations[label];
    if (slots === undefined) continue;
    if (slots.length !== 6) {
      faults.push(`point ${label} lists ${String(slots.length)} arrows (expected 6)`);
    }
    rotations.set(label, slots);
  }

  // Parse every authored arrow mention; gather structural faults without
  // short-circuiting so a single message can name every locus the scenarios ask
  // for (including co-occurring incidence faults later).
  type Mention = { readonly point: string; readonly slot: number; readonly spec: ArrowSpec };
  const mentions: Mention[] = [];
  const pairCounts = new Map<string, { count: number; specs: ArrowSpec[] }>();
  const specToEndpoints = new Map<ArrowSpec, { from: string; to: string }>();

  for (const label of pointLabels) {
    const slots = rotations.get(label);
    if (slots === undefined) continue;
    for (let slot = 0; slot < slots.length; slot += 1) {
      const spec = slots[slot];
      if (spec === undefined) continue;
      mentions.push({ point: label, slot, spec });
      const parsed = parseSpec(spec);
      if (parsed === undefined) {
        faults.push(`point ${label} names malformed arrow ${spec}`);
        continue;
      }
      const { from, to } = parsed;
      specToEndpoints.set(spec, { from, to });

      if (from === to) {
        faults.push(`arrow ${spec} is a self-loop (origin and target are both ${from})`);
      }
      if (!declared.has(from) || !declared.has(to)) {
        const missing = !declared.has(from) ? from : to;
        faults.push(
          `arrow ${spec} names undeclared point ${missing} (origin or target is not a declared point)`,
        );
      }
      if (label !== from && label !== to) {
        faults.push(
          `arrow ${spec} appears at point ${label}, which is not one of its endpoints`,
        );
      }

      const pairKey = `${from}->${to}`;
      const entry = pairCounts.get(pairKey);
      if (entry === undefined) {
        pairCounts.set(pairKey, { count: 1, specs: [spec] });
      } else {
        entry.count += 1;
        entry.specs.push(spec);
      }
    }
  }

  for (const [pair, { count, specs }] of pairCounts) {
    // Mentions are per rotation slot, so a well-formed arrow appears exactly
    // twice — once at its origin, once at its target. An ordered pair cannot
    // carry two *distinct* names here (a name is `from>to`), so the only
    // representable parallel pair is a repeated listing — "the duplicated pair".
    if (count > 2) {
      faults.push(`duplicated ordered pair ${pair} (parallel arrows, e.g. ${specs[0] ?? pair})`);
    }
  }

  // Directed 2-cycles: A→B and B→A both present.
  const directedPairs = new Set<string>();
  for (const [pair] of pairCounts) directedPairs.add(pair);
  for (const [pair] of pairCounts) {
    const sep = pair.indexOf('->');
    const from = pair.slice(0, sep);
    const to = pair.slice(sep + 2);
    if (from === to) continue;
    const reverse = `${to}->${from}`;
    if (directedPairs.has(reverse) && from < to) {
      // Name both arrows once; scenarios assert on one of them.
      faults.push(`arrows ${from}>${to} and ${to}>${from} form a directed 2-cycle`);
    }
  }

  // Alternation at every point that still has six slots.
  for (const label of pointLabels) {
    const slots = rotations.get(label);
    if (slots === undefined || slots.length !== 6) continue;
    const kinds: Array<'out' | 'in' | 'bad'> = [];
    for (const spec of slots) {
      const ends = specToEndpoints.get(spec) ?? parseSpec(spec);
      if (ends === undefined) {
        kinds.push('bad');
        continue;
      }
      if (ends.from === label && ends.to !== label) kinds.push('out');
      else if (ends.to === label && ends.from !== label) kinds.push('in');
      else kinds.push('bad');
    }
    let alternates = true;
    for (let i = 0; i < 6; i += 1) {
      const a = kinds[i];
      const b = kinds[(i + 1) % 6];
      if (a === 'bad' || b === 'bad' || a === b) {
        alternates = false;
        break;
      }
    }
    if (!alternates) {
      faults.push(
        `point ${label}'s in-arrows and out-arrows do not alternate around its six slots`,
      );
    }
  }

  // Every arrow must be listed at both endpoints (when both are declared).
  const mentionsBySpec = new Map<ArrowSpec, Set<string>>();
  for (const m of mentions) {
    const set = mentionsBySpec.get(m.spec) ?? new Set<string>();
    set.add(m.point);
    mentionsBySpec.set(m.spec, set);
  }
  for (const [spec, ends] of specToEndpoints) {
    if (!declared.has(ends.from) || !declared.has(ends.to)) continue;
    if (ends.from === ends.to) continue;
    const at = mentionsBySpec.get(spec) ?? new Set();
    if (!at.has(ends.from) || !at.has(ends.to)) {
      faults.push(
        `arrow ${spec} is referenced but not declared at both endpoints (dangling identifier)`,
      );
    }
  }

  // The arrow-side fault above already names an undeclared endpoint, but the
  // dangling *identifier* is the locus the scenario reads, so name it plainly
  // too — once per label, however many arrows reach for it.
  const danglingNamed = new Set<string>();
  for (const ends of specToEndpoints.values()) {
    for (const p of [ends.from, ends.to]) {
      if (!declared.has(p) && !danglingNamed.has(p)) {
        danglingNamed.add(p);
        faults.push(`point ${p} is referenced but never declared`);
      }
    }
  }

  // If structural faults exist, stop before deriving a nonsense vertex lattice.
  throwAll(faults);

  // ── Build the graph ────────────────────────────────────────────────────────
  const pointIds = new Map<string, PointId>();
  const labelOf = new Map<PointId, string>();
  for (const label of pointLabels) {
    const id = fixturePoint(description, label);
    pointIds.set(label, id);
    labelOf.set(id, label);
  }

  const arrows = new Map<ArrowSpec, ParsedArrow>();
  const arrowById = new Map<ArrowId, ParsedArrow>();
  for (const [spec, ends] of specToEndpoints) {
    if (arrows.has(spec)) continue;
    const id = fixtureArrow(description, ends.from, ends.to);
    const parsed: ParsedArrow = { spec, from: ends.from, to: ends.to, id };
    arrows.set(spec, parsed);
    arrowById.set(id, parsed);
  }

  const outs = new Map<string, readonly ArrowId[]>();
  const ins = new Map<string, readonly ArrowId[]>();
  const slotAt = new Map<string, Map<ArrowSpec, Slot>>();

  for (const label of pointLabels) {
    const slots = rotations.get(label) as readonly ArrowSpec[];
    const outList: ArrowId[] = [];
    const inList: ArrowId[] = [];
    const slotMap = new Map<ArrowSpec, Slot>();
    for (let s = 0; s < 6; s += 1) {
      const spec = slots[s] as ArrowSpec;
      const arrow = arrows.get(spec);
      if (arrow === undefined) continue;
      slotMap.set(spec, s as Slot);
      if (arrow.from === label) outList.push(arrow.id);
      if (arrow.to === label) inList.push(arrow.id);
    }
    outs.set(label, outList);
    ins.set(label, inList);
    slotAt.set(label, slotMap);
  }

  // ── Derive vertices from minimal directed 3-cycles (P02 D1, D5) ────────────
  const cycles = new Map<string, readonly ArrowSpec[]>();
  for (const label of pointLabels) {
    for (const aId of outs.get(label) ?? []) {
      const a = arrowById.get(aId);
      if (a === undefined) continue;
      for (const bId of outs.get(a.to) ?? []) {
        const b = arrowById.get(bId);
        if (b === undefined) continue;
        for (const cId of outs.get(b.to) ?? []) {
          const c = arrowById.get(cId);
          if (c === undefined) continue;
          if (c.to === label) {
            const specs = [a.spec, b.spec, c.spec] as const;
            cycles.set(cycleKey(specs), specs);
          }
        }
      }
    }
  }

  // Incidence: every point on exactly 6 cycles, every arrow on exactly 2.
  const cyclesThroughPoint = new Map<string, number>();
  const cyclesThroughArrow = new Map<ArrowSpec, number>();
  for (const label of pointLabels) cyclesThroughPoint.set(label, 0);
  for (const spec of arrows.keys()) cyclesThroughArrow.set(spec, 0);

  for (const specs of cycles.values()) {
    const pointsOnCycle = new Set<string>();
    for (const spec of specs) {
      const arrow = arrows.get(spec);
      if (arrow === undefined) continue;
      cyclesThroughArrow.set(spec, (cyclesThroughArrow.get(spec) ?? 0) + 1);
      pointsOnCycle.add(arrow.from);
      pointsOnCycle.add(arrow.to);
    }
    for (const p of pointsOnCycle) {
      cyclesThroughPoint.set(p, (cyclesThroughPoint.get(p) ?? 0) + 1);
    }
  }

  for (const label of pointLabels) {
    const n = cyclesThroughPoint.get(label) ?? 0;
    if (n !== 6) {
      faults.push(
        `point ${label} lies on ${String(n)} minimal cycles/triangles (expected 6)`,
      );
    }
  }
  for (const [spec, n] of cyclesThroughArrow) {
    if (n !== 2) {
      faults.push(
        `arrow ${spec} borders ${String(n)} minimal cycles/triangles (expected 2); ` +
          `a cycle cannot carry exactly one derived vertex when incidence does not close`,
      );
    }
  }
  throwAll(faults);

  // Mint one vertex per cycle from the canonical key (never from insertion order).
  const sortedKeys = [...cycles.keys()].toSorted();
  const vertexByKey = new Map<string, VertexId>();
  const borderByVertex = new Map<VertexId, readonly ArrowId[]>();
  const flanksAccum = new Map<ArrowId, VertexId[]>();

  for (const key of sortedKeys) {
    const specs = cycles.get(key);
    if (specs === undefined) continue;
    const vertex = fixtureVertex(description, key);
    vertexByKey.set(key, vertex);
    const border = specs
      .map((s) => arrows.get(s)?.id)
      .filter((id): id is ArrowId => id !== undefined)
      .toSorted((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    borderByVertex.set(vertex, border);
    for (const id of border) {
      const list = flanksAccum.get(id) ?? [];
      list.push(vertex);
      flanksAccum.set(id, list);
    }
  }

  const flanksByArrow = new Map<ArrowId, readonly VertexId[]>();
  for (const [id, list] of flanksAccum) {
    flanksByArrow.set(
      id,
      [...list].toSorted((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    );
  }

  return {
    description,
    pointLabels,
    pointIds,
    labelOf,
    rotations,
    arrows,
    arrowById,
    outs,
    ins,
    slotAt,
    cycles,
    vertexByKey,
    borderByVertex,
    flanksByArrow,
  };
};

const requirePoint = (board: BuiltBoard, point: PointId): string => {
  const label = board.labelOf.get(point);
  if (label === undefined) {
    return reject(`unknown point ${String(point)}`);
  }
  return label;
};

const requireArrow = (board: BuiltBoard, arrow: ArrowId): ParsedArrow => {
  const parsed = board.arrowById.get(arrow);
  if (parsed === undefined) {
    return reject(`unknown arrow ${String(arrow)}`);
  }
  return parsed;
};

/**
 * Grow a graph-distance ball over both arrow directions.
 *
 * Neighbours are visited in a fixed order — out-arrows in cyclic slot order,
 * then in-arrows in cyclic slot order — so the window is a pure function of
 * centre and radius (P02 D5; same discipline as the tiling's BFS).
 */
const growWindow = (board: BuiltBoard, centre: PointId, radius: number): BoardWindow => {
  if (!Number.isInteger(radius) || radius < 0) {
    reject(`window radius must be a whole number of steps, not ${String(radius)}`);
  }
  const startLabel = requirePoint(board, centre);

  const points: PointId[] = [centre];
  const seen = new Set<PointId>([centre]);
  let frontier: string[] = [startLabel];

  for (let step = 0; step < radius; step += 1) {
    const next: string[] = [];
    for (const label of frontier) {
      const neighbours: string[] = [];
      for (const aId of board.outs.get(label) ?? []) {
        const a = board.arrowById.get(aId);
        if (a !== undefined) neighbours.push(a.to);
      }
      for (const aId of board.ins.get(label) ?? []) {
        const a = board.arrowById.get(aId);
        if (a !== undefined) neighbours.push(a.from);
      }
      for (const n of neighbours) {
        const id = board.pointIds.get(n);
        if (id === undefined || seen.has(id)) continue;
        seen.add(id);
        points.push(id);
        next.push(n);
      }
    }
    frontier = next;
  }

  const arrows: ArrowId[] = [];
  const arrowSeen = new Set<ArrowId>();
  for (const p of points) {
    const label = board.labelOf.get(p);
    if (label === undefined) continue;
    for (const a of [...(board.outs.get(label) ?? []), ...(board.ins.get(label) ?? [])]) {
      if (!arrowSeen.has(a)) {
        arrowSeen.add(a);
        arrows.push(a);
      }
    }
  }

  const vertices: VertexId[] = [];
  const vertexSeen = new Set<VertexId>();
  for (const a of arrows) {
    for (const v of board.flanksByArrow.get(a) ?? []) {
      if (!vertexSeen.has(v)) {
        vertexSeen.add(v);
        vertices.push(v);
      }
    }
  }

  return { centre, radius, points, arrows, vertices };
};

/**
 * Build a `GeometryPort` from a rotation system.
 *
 * Two ports built from the same description agree exactly — same seed, same
 * windows, same derived vertex ids — because every id is minted from a canonical
 * key rather than from map-insertion order (P02 D5).
 *
 * @throws ContractViolation if the board is malformed (D2).
 */
export const makeFixture = (description: BoardDescription): GeometryPort => {
  const board = validateAndBuild(description);
  const seedLabel = board.pointLabels[0];
  if (seedLabel === undefined) {
    return reject('board description has no points');
  }
  const seed = board.pointIds.get(seedLabel) as PointId;

  return {
    seedPoint: (): PointId => seed,

    window: (centre: PointId, radius: number): BoardWindow => growWindow(board, centre, radius),

    inArrows: (point: PointId): readonly ArrowId[] => {
      const label = requirePoint(board, point);
      return board.ins.get(label) ?? [];
    },

    outArrows: (point: PointId): readonly ArrowId[] => {
      const label = requirePoint(board, point);
      return board.outs.get(label) ?? [];
    },

    origin: (arrow: ArrowId): PointId => {
      const a = requireArrow(board, arrow);
      return board.pointIds.get(a.from) as PointId;
    },

    target: (arrow: ArrowId): PointId => {
      const a = requireArrow(board, arrow);
      return board.pointIds.get(a.to) as PointId;
    },

    flankVertices: (arrow: ArrowId): readonly VertexId[] => {
      requireArrow(board, arrow);
      const flanks = board.flanksByArrow.get(arrow);
      if (flanks === undefined) {
        return reject(`arrow ${String(arrow)} has no flank vertices`);
      }
      return flanks;
    },

    borderArrows: (vertex: VertexId): readonly ArrowId[] => {
      const border = board.borderByVertex.get(vertex);
      if (border === undefined) {
        return reject(`unknown vertex ${String(vertex)}`);
      }
      return border;
    },

    slotOf: (point: PointId, arrow: ArrowId): Slot => {
      const label = requirePoint(board, point);
      const a = requireArrow(board, arrow);
      const slot = board.slotAt.get(label)?.get(a.spec);
      if (slot === undefined) {
        return reject(`arrow ${String(arrow)} is not incident to point ${String(point)}`);
      }
      return slot;
    },
  };
};
