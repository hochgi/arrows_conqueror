/**
 * P35 invariants — the twenty-one EARS statements in
 * `docs/spec/count-after-route/count-after-route.md`, one property test each.
 *
 * Properties run over a bank of boards and drafts rather than one example: the
 * generated tiling at three stack sizes, a truncated ray, a merge, and **both**
 * fixture boards, each driven through one- and two-run drafts. A case's clicks are
 * read off the offer itself (`ray N of slot S`) rather than hard-coded, so the
 * same plan is meaningful on an abstract fixture board where a slot carries no
 * geometry.
 *
 * Every count claim is checked against {@link countsThatWalk}, which walks
 * `rules.apply` at 1, 2, 3 … heads and consults `speed()` nowhere. That is the
 * point of "the floor is measured, never derived": if the offer and the engine
 * disagree, the test says which numbers.
 *
 * Each property asserts **non-vacuity** first. An unimplemented helper that
 * returns an empty list satisfies almost every "nothing exceeds" claim, and the
 * one that matters most here — *the control is absent* — is satisfied by a
 * control that is never drawn at all.
 *
 * Invariant 14 (the docked strip intersects no clickable arrow at 375, 768 and
 * 1280 px) is the one statement that cannot be settled without a DOM renderer.
 * What is checked purely is the stronger half of the design: the control carries
 * **no coordinates at all**, so there is no rectangle over the board to intersect.
 * The rendered geometry is left explicitly untested and reported.
 */

import { describe, expect, it } from 'vitest';
import type { ArrowId, GameState, Move } from '@conquarrow/contracts';
import { MINIMAL, SPACIOUS, fixtureArrow } from '@conquarrow/geometry-fixtures';
import type { InputSnapshot, RoutePhase } from '../src/input/modes';
import { autoApplies, routePaint, runCarries, runMoves } from '../src/route';
import type { AutoApplyTest } from '../src/route';
import {
  A,
  B,
  acceptedRunLength,
  arrowAlong,
  blankState,
  carriesOf,
  clickArrow,
  controlOf,
  controlShown,
  countsOf,
  countsThatWalk,
  draftOf,
  earlierMovesOf,
  exitsOf,
  fixtureBoard,
  geometry,
  headsOn,
  inputsFromPhase,
  lastRunLengthOf,
  lastRunMovesOf,
  openField,
  optionFor,
  pendingOf,
  rayOf,
  raySlotWalk,
  readSource,
  routePhaseOf,
  rules,
  runStartOf,
  selectRoute,
  sortedIds,
  sourceArrow,
  stateWith,
} from './count-after-route.support';
import type { Board, Selected } from './count-after-route.support';

const board: Board = { geometry, rules };
const from = sourceArrow(geometry);
const SLOTS = [0, 1, 2] as const;

const spacious = fixtureBoard(SPACIOUS);
const minimal = fixtureBoard(MINIMAL);
const spaciousFrom = fixtureArrow(SPACIOUS, '0', '7');
const minimalFrom = fixtureArrow(MINIMAL, '0', '1');

const soloOn = (arrow: ArrowId, heads: number): GameState => ({
  ...blankState(),
  groups: new Map([[arrow, { owner: A, heads, spent: 0 }]]),
});

/** One leg of a plan: take the ray arrow at `index` along `slot` from the tip. */
interface Leg {
  readonly slot: 0 | 1 | 2;
  readonly index: number;
}

interface Case {
  readonly label: string;
  readonly board: Board;
  readonly state: GameState;
  readonly from: ArrowId;
  /** Clicks, expressed against the offer so they work on any board. */
  readonly plan: readonly Leg[];
}

const CASES: readonly Case[] = [
  { label: 'tiling, 8 heads, one run of two', board, state: openField(from, 8), from, plan: [{ slot: 0, index: 1 }] },
  { label: 'tiling, 8 heads, one run of one', board, state: openField(from, 8), from, plan: [{ slot: 1, index: 0 }] },
  { label: 'tiling, 12 heads, two runs', board, state: openField(from, 12), from, plan: [{ slot: 0, index: 0 }, { slot: 1, index: 0 }] },
  {
    label: 'tiling, 16 heads, two runs of two',
    board,
    state: openField(from, 16),
    from,
    plan: [
      { slot: 0, index: 1 },
      { slot: 1, index: 1 },
    ],
  },
  {
    label: 'tiling, 16 heads, ray truncated by an enemy at three',
    board,
    state: stateWith([
      [from, { owner: A, heads: 16 }],
      [arrowAlong(geometry, from, 0, 3), { owner: B, heads: 2 }],
    ]),
    from,
    plan: [{ slot: 0, index: 1 }],
  },
  {
    label: 'tiling, 8 heads, a run ending in a merge',
    board,
    state: stateWith([
      [from, { owner: A, heads: 8 }],
      [arrowAlong(geometry, from, 0, 2), { owner: A, heads: 3 }],
    ]),
    from,
    plan: [{ slot: 0, index: 1 }],
  },
  {
    label: 'spacious fixture, 16 heads, two runs',
    board: spacious,
    state: soloOn(spaciousFrom, 16),
    from: spaciousFrom,
    plan: [
      { slot: 0, index: 1 },
      { slot: 1, index: 0 },
    ],
  },
  {
    label: 'minimal fixture, 8 heads, one run',
    board: minimal,
    state: soloOn(minimalFrom, 8),
    from: minimalFrom,
    plan: [{ slot: 0, index: 0 }],
  },
];

interface Walked {
  readonly selected: Selected;
  readonly snap: InputSnapshot;
  readonly phase: RoutePhase;
  /** How many legs of the plan actually landed. */
  readonly runs: number;
}

/**
 * Drive a case's plan through the input mode, stopping if the phase leaves
 * `route` (an auto-apply) or the ray it names is shorter than the plan.
 */
const walkPlan = (item: Case, plan: readonly Leg[] = item.plan): Walked => {
  const selected = selectRoute(item.board, item.state, item.from);
  let snap = selected.snap;
  let runs = 0;
  for (const leg of plan) {
    if (snap.phase.kind !== 'route') break;
    const target = rayOf(snap, leg.slot)[leg.index];
    if (target === undefined) break;
    snap = clickArrow(selected, target);
    if (snap.phase.kind !== 'route') break;
    runs += 1;
  }
  return { selected, snap, phase: routePhaseOf(snap), runs };
};

/** The cases whose whole plan lands in the route phase — most properties want these. */
const drafted = (): readonly (Walked & { readonly label: string })[] =>
  CASES.map((item) => ({ ...walkPlan(item), label: item.label })).filter(
    (walked) => walked.runs > 0,
  );

describe('P35 invariants', () => {
  it('1. While the draft is empty, the adapter shall render no count control.', () => {
    let checked = 0;
    for (const item of CASES) {
      const selected = selectRoute(item.board, item.state, item.from);
      expect(controlShown(selected.snap), `${item.label}: fresh`).toBe(false);
      // …and again after a pop back to the source, which is also an empty draft.
      const walked = walkPlan(item);
      if (walked.runs > 0) {
        const popped = clickArrow(walked.selected, item.from);
        expect(draftOf(popped), `${item.label}: popped`).toHaveLength(0);
        expect(controlShown(popped), `${item.label}: popped`).toBe(false);
      }
      // Non-vacuity: with a run drafted the control *is* drawn.
      if (walked.runs > 0) expect(controlShown(walked.snap), item.label).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(CASES.length);
  });

  it('2. While the draft is empty, `offer.carries` shall be empty.', () => {
    for (const item of CASES) {
      const selected = selectRoute(item.board, item.state, item.from);
      expect(carriesOf(selected.snap), item.label).toEqual([]);
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      expect(carriesOf(walked.snap).length, `${item.label}: drafted`).toBeGreaterThan(0);
    }
  });

  it("3. When a run is appended, the adapter shall set that run's count to the heads standing on the tip the run started from.", () => {
    let runs = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const start = runStartOf(item.board, item.state, walked.phase);
      const counts = countsOf(lastRunMovesOf(walked.snap));
      // Non-vacuity: a run with no moves in it satisfies any claim about them.
      expect(walked.phase.lastRunLength, `${item.label}: no run recorded`).toBeGreaterThan(0);
      expect(counts.length, item.label).toBe(walked.phase.lastRunLength);
      for (const count of counts) {
        expect(count, `${item.label}: run count`).toBe(start.heads);
      }
      runs += 1;
    }
    expect(runs).toBeGreaterThan(5);
  });

  it("4. The rays offered from a tip shall be measured at that tip's full head count.", () => {
    let measured = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const after = inputsFromPhase(item.board, item.state, walked.phase);
      for (const slot of SLOTS) {
        // A terminal tip offers nothing at all (P34) — that is not a shorter ray.
        if (walked.phase.offer.clickable.size === 0) continue;
        expect(rayOf(walked.snap, slot).length, `${item.label} slot ${String(slot)}`).toBe(
          acceptedRunLength(
            item.board,
            after.state,
            walked.phase.tip,
            slot,
            walked.phase.tipHeads,
          ),
        );
        measured += 1;
      }
    }
    expect(measured).toBeGreaterThan(6);
  });

  it('5. `offer.carries` shall list exactly the counts for which every step of the last run is accepted by `rules.apply`, ascending.', () => {
    let compared = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const start = runStartOf(item.board, item.state, walked.phase);
      const steps = exitsOf(lastRunMovesOf(walked.snap));
      const oracle = countsThatWalk(item.board.rules, start.state, start.start, steps);
      expect(oracle.length, `${item.label}: oracle`).toBeGreaterThan(0);
      expect(carriesOf(walked.snap), item.label).toEqual(oracle);
      expect([...carriesOf(walked.snap)].toSorted((a, b) => a - b), item.label).toEqual([
        ...carriesOf(walked.snap),
      ]);
      // The helper answers the same as the phase, asked about the same run.
      expect(
        runCarries(inputsFromPhase(item.board, item.state, walked.phase)),
        `${item.label}: helper`,
      ).toEqual(oracle);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(5);
  });

  it('6. `offer.carries` shall never contain a count exceeding the heads standing on the arrow the last run started from.', () => {
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const start = runStartOf(item.board, item.state, walked.phase);
      expect(carriesOf(walked.snap).length, item.label).toBeGreaterThan(0);
      for (const count of carriesOf(walked.snap)) {
        expect(count, `${item.label}: ${String(count)} > ${String(start.heads)}`).toBeLessThanOrEqual(
          start.heads,
        );
      }
      const control = controlOf(walked.snap);
      expect(control?.ceiling, item.label).toBe(start.heads);
    }
  });

  it("7. When the count of the last run is changed, the adapter shall leave every earlier run's moves byte-identical.", () => {
    let changed = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const earlier: readonly Move[] = [...earlierMovesOf(walked.snap)];
      // Non-vacuity: with no run boundary recorded, "earlier" would be the whole
      // draft and the claim would be P34's repealed one.
      expect(walked.phase.lastRunLength, `${item.label}: no run recorded`).toBeGreaterThan(0);
      for (const count of carriesOf(walked.snap)) {
        const snap = walked.selected.mode.setCarry(count);
        expect(earlierMovesOf(snap), `${item.label} at ${String(count)}`).toEqual(earlier);
        changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('8. When the count of the last run is changed, the adapter shall re-emit exactly `lastRunLength` moves.', () => {
    let changed = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const length = walked.phase.draft.length;
      const runLength = walked.phase.lastRunLength;
      expect(runLength, item.label).toBeGreaterThan(0);
      for (const count of carriesOf(walked.snap)) {
        const snap = walked.selected.mode.setCarry(count);
        const phase = routePhaseOf(snap);
        expect(phase.draft, `${item.label} at ${String(count)}`).toHaveLength(length);
        expect(phase.lastRunLength, `${item.label} at ${String(count)}`).toBe(runLength);
        expect(countsOf(lastRunMovesOf(snap)), `${item.label} at ${String(count)}`).toEqual(
          Array.from({ length: runLength }, () => count),
        );
        changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('9. Where a count is not in `offer.carries`, the adapter shall ignore the request to set it.', () => {
    let refused = 0;
    let belowFloor = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const before = [...walked.phase.draft];
      const carries = carriesOf(walked.snap);
      const ceiling = runStartOf(item.board, item.state, walked.phase).heads;
      const wrong = [0, -1, ceiling + 1, ceiling + 7].filter(
        (count) => !carries.includes(count),
      );
      // Plus every count under the floor, which is where a derived offer drifts.
      for (let count = 1; count < (carries[0] ?? 1); count += 1) {
        wrong.push(count);
        belowFloor += 1;
      }
      for (const count of wrong) {
        const snap = walked.selected.mode.setCarry(count);
        expect(draftOf(snap), `${item.label} at ${String(count)}`).toEqual(before);
        refused += 1;
      }
    }
    expect(refused).toBeGreaterThan(10);
    // Non-vacuity: a floor above one is where a derived offer drifts, so at least
    // one case in the bank has to have counts below its floor to refuse.
    expect(belowFloor).toBeGreaterThan(0);
  });

  it('10. When a click yields a one-run draft with one legal count and an empty clickable set, the adapter shall apply the draft without rendering a control.', () => {
    // `2^(k-1)` heads walking exactly `k` steps: the count is forced and the
    // allowance is spent, for k = 1, 2, 3, 4.
    for (const k of [1, 2, 3, 4]) {
      const heads = 2 ** (k - 1);
      const state = openField(from, heads);
      const target = arrowAlong(geometry, from, 0, k);
      // The premise, measured: exactly one count walks the whole run.
      expect(
        countsThatWalk(rules, state, from, raySlotWalk(geometry, from, 0, k)),
        `k=${String(k)}`,
      ).toEqual([heads]);
      const selected = selectRoute(board, state, from);
      const snap = clickArrow(selected, target);
      expect(snap.phase.kind, `k=${String(k)}`).toBe('idle');
      expect(pendingOf(snap), `k=${String(k)}`).toHaveLength(k);
      expect(controlShown(snap), `k=${String(k)}`).toBe(false);
    }
  });

  it('11. When a click yields a draft failing any of those three conditions, the adapter shall render the control and apply nothing.', () => {
    const failing: readonly { readonly label: string; readonly heads: number; readonly plan: readonly Leg[] }[] = [
      { label: 'several legal counts', heads: 8, plan: [{ slot: 0, index: 0 }] },
      { label: 'a live tip', heads: 4, plan: [{ slot: 0, index: 1 }] },
      { label: 'two runs', heads: 8, plan: [{ slot: 0, index: 0 }, { slot: 0, index: 2 }] },
    ];
    for (const item of failing) {
      const state = openField(from, item.heads);
      const untouched = openField(from, item.heads);
      const walked = walkPlan(
        { label: item.label, board, state, from, plan: item.plan },
        item.plan,
      );
      expect(walked.runs, item.label).toBe(item.plan.length);
      expect(controlShown(walked.snap), item.label).toBe(true);
      expect(pendingOf(walked.snap), item.label).toHaveLength(0);
      expect(state, item.label).toEqual(untouched);
    }
    // And the predicate itself: true only when all three hold.
    const verdicts: readonly (readonly [AutoApplyTest, boolean])[] = [
      [{ draftLength: 1, lastRunLength: 1, counts: [1], clickable: 0 }, true],
      [{ draftLength: 2, lastRunLength: 1, counts: [1], clickable: 0 }, false],
      [{ draftLength: 1, lastRunLength: 1, counts: [1, 2], clickable: 0 }, false],
      [{ draftLength: 1, lastRunLength: 1, counts: [1], clickable: 3 }, false],
      [{ draftLength: 0, lastRunLength: 0, counts: [], clickable: 3 }, false],
    ];
    for (const [test, expected] of verdicts) {
      expect(autoApplies(test), JSON.stringify(test)).toBe(expected);
    }
  });

  it('12. An auto-applied click shall place in `pending` exactly the moves a click followed by Send would have placed.', () => {
    for (const k of [1, 2, 3, 4]) {
      const heads = 2 ** (k - 1);
      const state = openField(from, heads);
      const target = arrowAlong(geometry, from, 0, k);
      const selected = selectRoute(board, state, from);
      // The run the offer named, at the count the click drafts it with.
      const expected = runMoves(from, optionFor(selected.snap, target).steps, heads);
      const snap = clickArrow(selected, target);
      expect(pendingOf(snap), `k=${String(k)}`).toEqual(expected);
    }
  });

  it('13. While the match is over or input is locked, the adapter shall render no count control.', () => {
    let checked = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      expect(controlShown(walked.snap), `${item.label}: playing`).toBe(true);
      expect(controlShown(walked.snap, { matchOver: true }), `${item.label}: over`).toBe(false);
      expect(controlShown(walked.snap, { inputLocked: true }), `${item.label}: locked`).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('14. The docked strip shall not intersect any arrow in the clickable set at viewport widths 375, 768 and 1280.', () => {
    // Not assertable as geometry without a DOM renderer, and a test that
    // *pretended* to would prove nothing. What is asserted is the design that
    // makes the claim true by construction: the control carries no coordinates,
    // and neither the model nor the component knows anything about the stage.
    const walked = walkPlan({
      label: 'one run of two',
      board,
      state: openField(from, 8),
      from,
      plan: [{ slot: 0, index: 1 }],
    });
    const control = controlOf(walked.snap);
    expect(control).toBeDefined();
    expect(Object.keys(control ?? {}).toSorted()).toEqual([
      'ceiling',
      'count',
      'counts',
      'draftLength',
    ]);
    const dock = readSource('RouteDock.tsx');
    for (const positional of ['x:', 'y:', 'left', 'top', 'toScreen', 'viewport', 'stage']) {
      expect(dock, positional).not.toContain(positional);
    }
    const route = readSource('route.ts');
    for (const positional of ['toScreen', 'viewport', 'Viewport']) {
      expect(route, positional).not.toContain(positional);
    }
  });

  it('15. Send shall emit the draft in order regardless of how many runs it holds.', () => {
    let sent = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const draft = [...walked.phase.draft];
      const after = walked.selected.mode.send();
      expect(pendingOf(after), item.label).toEqual(draft);
      expect(after.phase.kind, item.label).toBe('idle');
      sent += 1;
    }
    expect(sent).toBeGreaterThan(5);
  });

  it('16. Cancel and a background click shall leave the game state unchanged.', () => {
    for (const item of CASES) {
      const before = structuredClone(item.state);
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const cancelled = walked.selected.mode.cancel();
      expect(pendingOf(cancelled), item.label).toHaveLength(0);
      expect(item.state, item.label).toEqual(before);
      const second = walkPlan(item);
      const background = second.selected.mode.onBackgroundClick();
      expect(pendingOf(background), item.label).toHaveLength(0);
      expect(item.state, item.label).toEqual(before);
    }
  });

  it('17. `lastRunLength` shall equal `0` if and only if the draft is empty.', () => {
    let checked = 0;
    for (const item of CASES) {
      const selected = selectRoute(item.board, item.state, item.from);
      expect(lastRunLengthOf(selected.snap), `${item.label}: fresh`).toBe(0);
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      expect(walked.phase.lastRunLength, item.label).toBeGreaterThan(0);
      const popped = clickArrow(walked.selected, item.from);
      expect(draftOf(popped), item.label).toHaveLength(0);
      expect(lastRunLengthOf(popped), item.label).toBe(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('18. `lastRunLength` shall never exceed `draft.length`.', () => {
    let checked = 0;
    let positive = 0;
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const seen: InputSnapshot[] = [walked.snap];
      // Every pop along the draft, and a count change at each stop.
      for (const arrow of exitsOf(walked.phase.draft)) {
        seen.push(clickArrow(walked.selected, arrow));
        const carries = carriesOf(seen[seen.length - 1] ?? walked.snap);
        const lowest = carries[0];
        if (lowest !== undefined) seen.push(walked.selected.mode.setCarry(lowest));
      }
      for (const snap of seen) {
        if (snap.phase.kind !== 'route') continue;
        const phase = routePhaseOf(snap);
        expect(phase.lastRunLength, item.label).toBeLessThanOrEqual(phase.draft.length);
        if (phase.lastRunLength > 0) positive += 1;
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(15);
    // Non-vacuity: a length that is always zero never exceeds anything.
    expect(positive).toBeGreaterThan(10);
  });

  it('19. After a pop to a walked arrow, `lastRunLength` shall describe the run that ends at that arrow.', () => {
    let popped = 0;
    for (const item of CASES) {
      if (item.plan.length < 2) continue;
      const firstLeg = walkPlan(item, item.plan.slice(0, 1));
      if (firstLeg.runs === 0) continue;
      const boundary = firstLeg.phase.tip;
      const firstRunLength = firstLeg.phase.lastRunLength;
      expect(firstRunLength, `${item.label}: no run recorded`).toBeGreaterThan(0);
      const both = walkPlan(item);
      if (both.runs < 2) continue;
      const back = clickArrow(both.selected, boundary);
      expect(routePhaseOf(back).tip, item.label).toBe(boundary);
      expect(lastRunLengthOf(back), item.label).toBe(firstRunLength);
      // …and the counts on offer are the first run's again.
      expect(carriesOf(back), item.label).toEqual(carriesOf(firstLeg.snap));
      popped += 1;
    }
    expect(popped).toBeGreaterThan(1);
  });

  it('20. Equal inputs shall produce an equal offer, an equal paint and an equal auto-apply verdict.', () => {
    for (const item of CASES) {
      const left = walkPlan(item);
      const right = walkPlan(item);
      if (left.runs === 0) continue;
      expect(left.phase.draft, item.label).toEqual(right.phase.draft);
      expect(left.phase.lastRunLength, item.label).toBe(right.phase.lastRunLength);
      expect(carriesOf(left.snap), item.label).toEqual(carriesOf(right.snap));
      expect(controlOf(left.snap), item.label).toEqual(controlOf(right.snap));
      expect(sortedIds(left.phase.offer.clickable.keys()), item.label).toEqual(
        sortedIds(right.phase.offer.clickable.keys()),
      );
      const paintOf = (phase: RoutePhase) => routePaint({ phase, pointer: 'fine' });
      expect(sortedIds(paintOf(left.phase).rayArrows), item.label).toEqual(
        sortedIds(paintOf(right.phase).rayArrows),
      );
      expect(paintOf(left.phase).draftArrows.map(String), item.label).toEqual(
        paintOf(right.phase).draftArrows.map(String),
      );
      const verdict = (phase: RoutePhase): boolean =>
        autoApplies({
          draftLength: phase.draft.length,
          lastRunLength: phase.lastRunLength,
          counts: phase.offer.carries,
          clickable: phase.offer.clickable.size,
        });
      expect(verdict(left.phase), item.label).toBe(verdict(right.phase));
    }
  });

  it('21. `route.ts` shall reference neither a clock nor a random source.', () => {
    const source = readSource('route.ts');
    expect(source.length).toBeGreaterThan(200);
    for (const banned of [
      'Date.now',
      'new Date',
      'Math.random',
      'performance.now',
      'crypto',
      'fetch(',
      'process.',
    ]) {
      expect(source.includes(banned), banned).toBe(false);
    }
  });
});

describe('P35 invariants — the case bank is non-vacuous', () => {
  it('every case drafts at least one run and offers at least one count', () => {
    const thin: string[] = [];
    for (const walked of drafted()) {
      if (carriesOf(walked.snap).length === 0) thin.push(walked.label);
    }
    expect(drafted()).toHaveLength(CASES.length);
    expect(thin).toEqual([]);
  });

  it('heads are conserved by the drafts the bank walks', () => {
    for (const item of CASES) {
      const walked = walkPlan(item);
      if (walked.runs === 0) continue;
      const sent = pendingOf(walked.selected.mode.send());
      let applied = item.state;
      for (const move of sent) applied = item.board.rules.apply(applied, move);
      const before = [...item.state.groups.values()]
        .filter((group) => group.owner === A)
        .reduce((sum, group) => sum + group.heads, 0);
      const after = [...applied.groups.values()]
        .filter((group) => group.owner === A)
        .reduce((sum, group) => sum + group.heads, 0);
      // No combat in the bank, so every head that set out is still standing.
      expect(after, item.label).toBe(before);
      expect(headsOn(applied, walked.phase.tip), item.label).toBeGreaterThan(0);
    }
  });
});
