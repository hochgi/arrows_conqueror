/**
 * One test per scenario in fixtures.edge-cases.feature.
 *
 * The validation scenarios feed **deliberately malformed boards** to
 * `makeFixture` and assert it refuses them at construction with a
 * `ContractViolation` whose message locates the fault (D2 — the validator is a
 * deliverable). Asserting the *type* `ContractViolation`, not merely `.toThrow`,
 * is what keeps these red against a phase-2 skeleton: the skeleton throws a plain
 * `Error` for unimplemented behaviour and returns an unvalidated stub for a bad
 * board, so a construction test is red because nothing of the right type is
 * thrown, not because a stub happened to satisfy it (contracts/src/errors.ts).
 *
 * @see docs/spec/fixtures/fixtures.edge-cases.feature
 */

import { describe, expect, it } from 'vitest';
import { ContractViolation, mintPointId } from '@conquarrow/contracts';
import type { ArrowId, GeometryPort, VertexId } from '@conquarrow/contracts';
import { MINIMAL, SPACIOUS, fixtureArrow, fixturePoint, makeFixture } from '../src/index';
import type { BoardDescription } from '../src/index';
import { BOARDS, SPACIOUS_CASE, straightAhead } from './support';

/**
 * `minimal` with a few rotation lines overridden (and optionally one point
 * omitted), for authoring single-fault malformed boards without copying all
 * seven lines each time.
 */
const withRotations = (
  name: string,
  overrides: Readonly<Record<string, readonly string[]>>,
  omit?: string,
): BoardDescription => {
  const rotations: Record<string, readonly string[]> = {};
  for (const [label, arrows] of Object.entries(MINIMAL.rotations)) {
    if (label !== omit) rotations[label] = arrows;
  }
  for (const [label, arrows] of Object.entries(overrides)) rotations[label] = arrows;
  return { name, rotations };
};

// ── Rule: a malformed board is rejected at construction, naming the fault ─────

const ILL_FORMED: readonly {
  readonly flaw: string;
  readonly board: BoardDescription;
  readonly loci: readonly (string | RegExp)[];
}[] = [
  {
    flaw: 'a point lists other than six arrows',
    board: withRotations('bad-arrow-count', { '3': ['3>4', '1>3', '3>0', '2>3', '3>5'] }),
    loci: ['3'], // names the point with five arrows
  },
  {
    flaw: "a point's in-arrows and out-arrows do not alternate",
    // slots 1 and 2 both out, so out/out are adjacent around point 3.
    board: withRotations('bad-alternation', { '3': ['3>4', '3>0', '1>3', '2>3', '3>5', '6>3'] }),
    loci: ['3', /alternat/i],
  },
  {
    flaw: "an arrow's target is not a declared point",
    board: withRotations('bad-endpoint', { '0': ['0>8', '3>0', '0>4', '5>0', '0>2', '6>0'] }),
    loci: ['8'], // point 8 does not exist
  },
  {
    flaw: 'an arrow appears at a point that is not one of its endpoints',
    // 1>2 has endpoints 1 and 2, neither is point 0.
    board: withRotations('bad-non-incident', { '0': ['0>1', '1>2', '0>4', '5>0', '0>2', '6>0'] }),
    loci: ['1>2'],
  },
  {
    flaw: 'a point is referenced as an endpoint but never declared',
    // Every line still names arrows to/from 6, but 6 has no rotation of its own.
    board: withRotations('bad-dangling-point', {}, '6'),
    loci: ['6'],
  },
  {
    flaw: 'an arrow has the same point as origin and target',
    board: withRotations('bad-self-loop', { '0': ['0>0', '3>0', '0>4', '5>0', '0>2', '6>0'] }),
    loci: ['0>0'],
  },
  {
    flaw: 'two arrows run between the same ordered pair of points',
    // 0>1 listed at both slot 0 and slot 2 of point 0.
    board: withRotations('bad-parallel', { '0': ['0>1', '3>0', '0>1', '5>0', '0>2', '6>0'] }),
    loci: ['0>1'],
  },
  {
    flaw: 'two arrows form a directed 2-cycle',
    // Introduce 1>0 alongside the existing 0>1.
    board: withRotations('bad-two-cycle', {
      '0': ['0>1', '3>0', '0>4', '1>0', '0>2', '6>0'],
      '1': ['1>2', '0>1', '1>0', '4>1', '1>3', '6>1'],
    }),
    loci: ['1>0'],
  },
];

describe('construction refuses an ill-formed board and locates the fault', () => {
  it.each(ILL_FORMED)('refuses a board in which $flaw', ({ board, loci }) => {
    // fixtures.edge-cases.feature: "Construction refuses an ill-formed board".
    const construct = (): GeometryPort => makeFixture(board);
    expect(construct).toThrow(ContractViolation);
    for (const locus of loci) expect(construct).toThrow(locus);
  });

  it('refuses a board that puts a point on the wrong number of minimal cycles', () => {
    // fixtures.edge-cases.feature: "A board putting a point on the wrong number
    // of cycles is refused". 3-in/3-out and alternating everywhere, but its
    // triangle counts are wrong: point 1 lies on 4 minimal cycles, not 6 — so
    // the derived vertex lattice would silently be wrong. The message names the
    // point and explains the cycle-count fault.
    const board: BoardDescription = {
      name: 'bad-point-cycle-count',
      rotations: {
        '0': ['0>1', '3>0', '0>7', '4>0', '0>5', '6>0'],
        '1': ['1>2', '0>1', '1>4', '5>1', '1>6', '7>1'],
        '2': ['2>3', '1>2', '2>5', '4>2', '2>7', '6>2'],
        '3': ['3>0', '2>3', '3>6', '4>3', '3>7', '5>3'],
        '4': ['4>3', '1>4', '4>2', '6>4', '4>0', '7>4'],
        '5': ['5>6', '0>5', '5>3', '2>5', '5>1', '7>5'],
        '6': ['6>4', '1>6', '6>0', '3>6', '6>2', '5>6'],
        '7': ['7>4', '0>7', '7>1', '2>7', '7>5', '3>7'],
      },
    };
    const construct = (): GeometryPort => makeFixture(board);
    expect(construct).toThrow(ContractViolation);
    expect(construct).toThrow(/point/i);
    expect(construct).toThrow(/cycle|triangle/i);
  });

  it('refuses a board whose cycles do not each carry exactly one vertex', () => {
    // fixtures.edge-cases.feature: "A board whose cycles do not carry exactly one
    // vertex is refused". SPEC §2: an edge borders exactly two triangles. Here an
    // arrow borders three (e.g. 0>7), so its cycle cannot own a single vertex and
    // the 3 : 1 : 2 incidence does not close. The message explains the derived-
    // lattice fault and names the offending cycle.
    //
    // NOTE FOR PHASE 3 / a finding for the human: this board also has two points
    // off six cycles. On realizable small boards the point-side fault (#10) and
    // the arrow/cycle-side fault (#11) always co-occur — verified exhaustively:
    // no single or double degree-preserving edit of `spacious` separates them,
    // and no random board with all points on six cycles ever had an arrow off
    // two. So the validator must name *every* incidence fault, not only the
    // first; that is D2 read strictly, not an invented rule.
    const board: BoardDescription = {
      name: 'bad-cycle-vertex',
      rotations: {
        '0': ['0>6', '1>0', '0>7', '3>0', '0>5', '4>0'],
        '1': ['1>2', '3>1', '1>0', '5>1', '1>6', '7>1'],
        '2': ['2>3', '1>2', '2>5', '4>2', '2>7', '6>2'],
        '3': ['3>0', '2>3', '3>1', '5>3', '3>4', '7>3'],
        '4': ['4>5', '3>4', '4>2', '6>4', '4>0', '7>4'],
        '5': ['5>6', '0>5', '5>3', '2>5', '5>1', '4>5'],
        '6': ['6>7', '0>6', '6>4', '1>6', '6>2', '5>6'],
        '7': ['7>4', '0>7', '7>1', '2>7', '7>3', '6>7'],
      },
    };
    const construct = (): GeometryPort => makeFixture(board);
    expect(construct).toThrow(ContractViolation);
    expect(construct).toThrow(/cycle|triangle|vertex/i);
  });
});

// ── Rule: identifiers from another board are rejected, not guessed ────────────

describe('a foreign identifier fails loudly', () => {
  const FOREIGN: readonly { readonly kind: string; readonly run: (g: GeometryPort) => unknown }[] = [
    {
      kind: 'a point identifier minted by the tiling',
      // Synthesised in the tiling's own id shape rather than imported, because a
      // fixture must not depend on `@conquarrow/geometry-tiling` (P02 DoD). The point
      // stands: `minimal` must reject an id from a namespace that is not its own.
      run: (g) => g.outArrows(mintPointId('tiling:p:0,0')),
    },
    {
      kind: 'a point identifier minted by "spacious"',
      run: (g) => g.outArrows(fixturePoint(SPACIOUS, '0')),
    },
    {
      kind: 'an arrow identifier minted by "spacious"',
      run: (g) => g.origin(fixtureArrow(SPACIOUS, '0', '1')),
    },
  ];

  it.each(FOREIGN)('rejects $kind given to "minimal"', ({ run }) => {
    // fixtures.edge-cases.feature: "A foreign identifier fails loudly".
    const g = makeFixture(MINIMAL);
    expect(() => run(g)).toThrow(ContractViolation);
  });

  it('refuses a well-formed identifier for a point this board does not have', () => {
    // fixtures.edge-cases.feature: "A well-formed identifier for an absent point
    // is refused". The id is in `minimal`'s own namespace but names no point it
    // has, so the board must recognise its own ids specifically — not merely
    // accept anything shaped like one.
    const g = makeFixture(MINIMAL);
    expect(() => g.outArrows(fixturePoint(MINIMAL, '99'))).toThrow(ContractViolation);
  });
});

// ── Rule: windows on a finite board ───────────────────────────────────────────

describe('windows on a finite board', () => {
  it('yields just the centre at radius zero', () => {
    // fixtures.edge-cases.feature: "A window of radius zero is just its centre".
    const g = makeFixture(MINIMAL);
    const seed = g.seedPoint();
    expect(g.window(seed, 0).points).toEqual([seed]);
  });

  it('is a proper part of "spacious" at radius one', () => {
    // fixtures.edge-cases.feature: "On spacious, a radius-1 window is a proper
    // part of the board". `minimal` is K7 and cannot express this — every point
    // is a neighbour of every other, so no window is ever a proper part.
    const g = makeFixture(SPACIOUS);
    const w = g.window(g.seedPoint(), 1);
    expect(w.points.length).toBeGreaterThan(1);
    expect(w.points.length).toBeLessThan(SPACIOUS_CASE.size);
  });

  it.each(BOARDS)('$label — a whole-board window is still closed under incidence', (board) => {
    // fixtures.edge-cases.feature: "A window that is the whole board is still
    // closed under incidence". Even when the ball has swallowed the board, its
    // three lists stay closed the way the port promises.
    const g = makeFixture(board.description);
    const w = g.window(g.seedPoint(), board.diameter);
    const arrows = new Set<ArrowId>(w.arrows);
    const vertices = new Set<VertexId>(w.vertices);
    for (const p of w.points) {
      for (const a of [...g.inArrows(p), ...g.outArrows(p)]) expect(arrows.has(a)).toBe(true);
    }
    for (const a of w.arrows) {
      for (const v of g.flankVertices(a)) expect(vertices.has(v)).toBe(true);
    }
  });
});

// ── Rule: the board exposes no extent ─────────────────────────────────────────

describe('the board exposes no extent', () => {
  it('offers no way to ask the board size, diameter or extent', () => {
    // fixtures.edge-cases.feature: "The port offers no way to ask how large the
    // board is". A structural guarantee: the surface is exactly the GeometryPort
    // methods, with nothing that leaks finiteness and no enumeration but window.
    // (Green from the surface alone, like the tiling's equivalent — its job is to
    // fail the day someone adds a size accessor.)
    expect(Object.keys(makeFixture(MINIMAL)).toSorted()).toEqual([
      'borderArrows',
      'flankVertices',
      'inArrows',
      'origin',
      'outArrows',
      'seedPoint',
      'slotOf',
      'target',
      'window',
    ]);
  });
});

// ── Rule: every straight-ahead ray closes on itself ───────────────────────────

describe.each(BOARDS)('$label — every straight-ahead ray closes on itself', (board) => {
  it('returns to the starting arrow after finitely many opposite-slot steps', () => {
    // fixtures.edge-cases.feature: "Following the opposite slot out of every point
    // returns to the start". Straight-ahead is a bijection on arrows, and every
    // orbit of a bijection on a finite set is a cycle — which is exactly why a
    // fixture cannot host even-odd fill (P02 measurement 2). On the unbounded
    // tiling the same walk never returns.
    const g = makeFixture(board.description);
    const arrows = g.window(g.seedPoint(), board.diameter).arrows;
    for (const start of arrows) {
      let here: ArrowId = straightAhead(g, start);
      let steps = 1;
      while (here !== start && steps <= arrows.length) {
        here = straightAhead(g, here);
        steps += 1;
      }
      expect(here).toBe(start);
    }
  });
});
