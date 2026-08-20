/**
 * P35 core scenarios — `docs/spec/count-after-route/count-after-route.core.feature`.
 *
 * One test per scenario, in feature order. Scenarios about the *content* of an
 * offer go through the pure helpers (`runCarries`, `countControl`, `autoApplies`);
 * scenarios about the *order of the questions* go through the input mode, because
 * that ordering is the whole feature: a click names the run, and only then is its
 * count asked.
 *
 * Every count in here is measured with {@link countsThatWalk} — walking
 * `rules.apply` at 1, 2, 3 … heads — never derived from `speed(N)`. Where a
 * literal appears it is a *checked* literal: the oracle is asserted alongside it,
 * so a rule change moves the test rather than silently disagreeing with it.
 *
 * Two numbers worth stating once, because several scenarios lean on them
 * (measured, not assumed — see the assertions):
 *
 * - a run of `k` steps needs `2^(k-1)` heads, so 8 heads walk 4 and 16 walk 5;
 * - `spent` travels with the movers, so a second run of two steps off a tip that
 *   has already spent two needs 8 heads, not 2. This is why the multi-run
 *   fixtures here carry 16 rather than the feature's illustrative 8.
 */

import { describe, expect, it } from 'vitest';
import { step } from '@conquarrow/contracts';
import type { ArrowId } from '@conquarrow/contracts';
import { routePaint, runMoves } from '../src/route';
import { selectionPaint } from '../src/selectionChrome';
import { createViewport, toScreen } from '../src/viewport';
import {
  acceptedRunLength,
  arrowAlong,
  carriesOf,
  clickArrow,
  clickRuns,
  clickableOf,
  controlOf,
  controlShown,
  countsOf,
  countsThatWalk,
  draftOf,
  earlierMovesOf,
  exitsOf,
  geometry,
  lastRunLengthOf,
  lastRunMovesOf,
  leastCountThatWalks,
  openField,
  optionFor,
  pendingOf,
  rayOf,
  raySlotWalk,
  readSource,
  refusingRules,
  routePhaseOf,
  rules,
  runInputs,
  selectOpenField,
  selectRoute,
  sourceArrow,
} from './count-after-route.support';

const board = { geometry, rules };
const from = sourceArrow(geometry);
const SLOTS = [0, 1, 2] as const;

const along = (slot: number, steps: number): ArrowId =>
  arrowAlong(geometry, from, slot, steps);

const first = along(0, 1);
const second = along(0, 2);
const third = along(0, 3);
const fourth = along(0, 4);

describe('P35 core — nothing is asked before a route exists', () => {
  it('Selecting a stack renders no count control', () => {
    const selected = selectOpenField(8);
    expect(selected.phase.kind).toBe('route');
    expect(selected.phase.draft).toHaveLength(0);
    expect(controlShown(selected.snap)).toBe(false);
  });

  it('The offerable counts are empty with an empty draft', () => {
    const selected = selectOpenField(8);
    expect(carriesOf(selected.snap)).toEqual([]);
  });

  it('The last run length is zero with an empty draft', () => {
    const selected = selectOpenField(8);
    expect(lastRunLengthOf(selected.snap)).toBe(0);
  });

  it("The rays are measured at the tip's full head count", () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    for (const slot of SLOTS) {
      const full = acceptedRunLength(board, state, from, slot, 8);
      expect(full, `slot ${String(slot)} is not worth measuring`).toBeGreaterThan(0);
      expect(rayOf(selected.snap, slot), `slot ${String(slot)}`).toHaveLength(full);
    }
  });
});

describe('P35 core — a click drafts the run at full strength', () => {
  it('A run carries every head standing on the tip', () => {
    const selected = selectOpenField(8);
    const snap = clickArrow(selected, second);
    expect(countsOf(draftOf(snap))).toEqual([8, 8]);
    expect(lastRunLengthOf(snap)).toBe(2);
  });

  it('A second run carries every head that arrived', () => {
    const selected = selectRoute(board, openField(from, 12), from);
    const snap = clickRuns(selected, [{ arrow: first, count: 8 }, { arrow: second }]);
    expect(countsOf(draftOf(snap))).toEqual([8, 8]);
    expect(routePhaseOf(snap).carry).toBe(8);
    expect(lastRunLengthOf(snap)).toBe(1);
  });

  it('The drafted run is the run that was painted', () => {
    const state = openField(from, 8);
    const untouched = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, third);
    expect(exitsOf(draftOf(snap)).map(String)).toEqual(
      raySlotWalk(geometry, from, 0, 3).map(String),
    );
    expect(pendingOf(snap)).toHaveLength(0);
    expect(state).toEqual(untouched);
  });
});

describe('P35 core — the count control edits the run just drafted', () => {
  it('The control appears after the click, not before', () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    expect(controlShown(selected.snap)).toBe(false);
    const snap = clickArrow(selected, first);
    const control = controlOf(snap);
    expect(control).toBeDefined();
    expect(control?.counts).toEqual(countsThatWalk(rules, state, from, [first]));
  });

  it('Lowering the count rewrites the last run', () => {
    const selected = selectOpenField(8);
    clickArrow(selected, first);
    const snap = selected.mode.setCarry(5);
    expect(countsOf(draftOf(snap))).toEqual([5]);
  });

  it('Lowering the count leaves earlier runs untouched', () => {
    const selected = selectOpenField(8);
    const drafted = clickRuns(selected, [{ arrow: second }, { arrow: third }]);
    const earlier = [...earlierMovesOf(drafted)];
    expect(earlier).toHaveLength(2);
    const snap = selected.mode.setCarry(4);
    expect(earlierMovesOf(snap)).toEqual(earlier);
    expect(countsOf(lastRunMovesOf(snap))).toEqual([4]);
  });

  it('Rewriting re-emits exactly the last run', () => {
    // Sixteen heads: two steps, then two more. `spent` travels with the movers,
    // so the second run's floor is 8 — the feature's illustrative 4 is a count
    // the engine refuses for a run in that position.
    const state = openField(from, 16);
    const selected = selectRoute(board, state, from);
    const secondRun = raySlotWalk(geometry, second, 1, 2);
    const target = secondRun[1];
    expect(target).toBeDefined();
    if (target === undefined) return;
    const drafted = clickRuns(selected, [{ arrow: second }, { arrow: target }]);
    expect(draftOf(drafted)).toHaveLength(4);
    const before = [...draftOf(drafted)];
    const lowered = leastCountThatWalks(
      rules,
      runInputs(board, state, from, [{ steps: raySlotWalk(geometry, from, 0, 2), count: 16 }]).state,
      second,
      secondRun,
    );
    expect(lowered).toBeLessThan(16);
    const snap = selected.mode.setCarry(lowered);
    const draft = draftOf(snap);
    expect(draft).toHaveLength(4);
    expect(draft.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(countsOf(draft.slice(2))).toEqual([lowered, lowered]);
  });

  it('A count below the floor is not offerable', () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, third);
    const floor = leastCountThatWalks(rules, state, from, raySlotWalk(geometry, from, 0, 3));
    expect(floor).toBe(4);
    expect(carriesOf(snap).filter((count) => count < floor)).toEqual([]);
    expect(carriesOf(snap)[0]).toBe(floor);
  });

  it("A count above the heads at the run's start is not offerable", () => {
    const selected = selectOpenField(8);
    const snap = clickArrow(selected, first);
    expect(carriesOf(snap).length).toBeGreaterThan(0);
    expect(carriesOf(snap).filter((count) => count > 8)).toEqual([]);
  });

  it('Setting a count that is not offerable is ignored', () => {
    const selected = selectOpenField(8);
    const drafted = clickArrow(selected, third);
    const before = [...draftOf(drafted)];
    const belowFloor = 3;
    expect(carriesOf(drafted)).not.toContain(belowFloor);
    const snap = selected.mode.setCarry(belowFloor);
    expect(draftOf(snap)).toEqual(before);
  });

  it('The floor is measured by the engine, not derived from speed', () => {
    // A rule change that refuses anything under six heads. `speed(4) = 3` would
    // still allow a three step run at four, so a derived floor would offer it.
    const state = openField(from, 8);
    const stubborn = { geometry, rules: refusingRules(rules, (move) => move.count < 6) };
    const run = raySlotWalk(geometry, from, 0, 3);
    expect(countsThatWalk(rules, state, from, run)[0]).toBe(4);
    const selected = selectRoute(stubborn, state, from);
    const snap = clickArrow(selected, third);
    expect(carriesOf(snap)).not.toContain(4);
    expect(carriesOf(snap)[0]).toBe(6);
  });
});

describe('P35 core — a click with nothing left to decide applies the move', () => {
  it('A single head walks one step with no control at all', () => {
    const selected = selectRoute(board, openField(from, 1), from);
    const snap = clickArrow(selected, first);
    expect(pendingOf(snap)).toEqual([step(from, first, 1)]);
    expect(snap.phase.kind).toBe('idle');
    expect(controlShown(snap)).toBe(false);
  });

  it('A power-of-two stack spending its whole allowance applies at once', () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, fourth);
    expect(countsThatWalk(rules, state, from, raySlotWalk(geometry, from, 0, 4))).toEqual([8]);
    expect(exitsOf(pendingOf(snap)).map(String)).toEqual(
      raySlotWalk(geometry, from, 0, 4).map(String),
    );
    expect(countsOf(pendingOf(snap))).toEqual([8, 8, 8, 8]);
    expect(snap.phase.kind).toBe('idle');
    expect(controlShown(snap)).toBe(false);
  });

  it('An auto-applied click emits what Send would have emitted', () => {
    const selected = selectRoute(board, openField(from, 1), from);
    // What a click would have drafted, from the offer the click read.
    const option = optionFor(selected.snap, first);
    const wouldSend = runMoves(from, option.steps, 1);
    const snap = clickArrow(selected, first);
    expect(pendingOf(snap)).toEqual(wouldSend);
  });

  it.each([
    [8, 1, 'eight legal counts remain'],
    [2, 1, 'two legal counts remain'],
    [8, 2, 'the tip can still be extended'],
  ])('A click that still has a decision left renders the control (%i heads, %i steps)', (
    heads,
    steps,
    why,
  ) => {
    const state = openField(from, heads);
    const untouched = openField(from, heads);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, along(0, steps));
    expect(controlShown(snap), why).toBe(true);
    expect(pendingOf(snap), why).toHaveLength(0);
    expect(state, why).toEqual(untouched);
  });

  it('A multi-run draft never auto-applies', () => {
    // One step, then three: the second run's count is forced to 8 and the tip has
    // spent its whole allowance — every part of the auto-apply test but the first.
    const state = openField(from, 8);
    const untouched = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickRuns(selected, [{ arrow: first }, { arrow: fourth }]);
    const phase = routePhaseOf(snap);
    expect(phase.draft).toHaveLength(4);
    expect(phase.lastRunLength).toBe(3);
    expect(phase.offer.carries).toHaveLength(1);
    expect(phase.offer.clickable.size).toBe(0);
    expect(controlShown(snap)).toBe(true);
    expect(pendingOf(snap)).toHaveLength(0);
    expect(state).toEqual(untouched);
  });
});

describe('P35 core — the control lives below the board, never on it', () => {
  it('The strip is a sibling of the stage', () => {
    const app = readSource('App.tsx');
    const stage = app.indexOf('<div className="stage"');
    expect(stage).toBeGreaterThan(-1);
    // The stage's own closing tag, at the indentation it was opened at.
    const closed = app.indexOf('\n      </div>', stage);
    const dock = app.indexOf('<RouteDock');
    expect(dock, 'App renders no RouteDock').toBeGreaterThan(-1);
    expect(closed).toBeGreaterThan(-1);
    expect(dock, 'the dock is inside the stage').toBeGreaterThan(closed);
    // And it is not anchored on anything: no stage pixels reach it.
    expect(app.slice(dock, dock + 400)).not.toContain('tipScreen');
    const dockSource = readSource('RouteDock.tsx');
    for (const positional of ['left', 'top', 'toScreen', 'tipScreen', 'viewport']) {
      expect(dockSource, positional).not.toContain(positional);
    }
  });

  it.each([375, 768, 1280])(
    'The strip overlaps no clickable arrow (%i px)',
    (width) => {
      // A clickable arrow's stage position depends on the viewport…
      expect(toScreen(createViewport(width, 800), 1, 1).x).toBe(
        (1 - 0) * 48 + width / 2,
      );
      // …and the control's model depends on none of it: it carries no coordinates
      // at all, so there is no rectangle over the board for a clickable arrow to
      // intersect. The rendered rectangle needs a DOM; see the invariants suite.
      const selected = selectOpenField(8);
      const snap = clickArrow(selected, first);
      const control = controlOf(snap);
      expect(control).toBeDefined();
      expect(Object.keys(control ?? {}).toSorted()).toEqual([
        'ceiling',
        'count',
        'counts',
        'draftLength',
      ]);
    },
  );

  it('The tip keeps its halo while the control is docked', () => {
    const selected = selectOpenField(8);
    const snap = clickArrow(selected, first);
    const phase = routePhaseOf(snap);
    expect(controlShown(snap)).toBe(true);
    expect(routePaint({ phase, pointer: 'fine' }).tip).toBe(phase.tip);
    const paint = selectionPaint({ phase, highlights: snap.highlights, pointer: 'fine' });
    expect(paint.selected).toBe(from);
    expect(paint.selectedEmphasis).toBe(true);
  });

  it('Changing the count repaints the rays live', () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, first);
    const snap = selected.mode.setCarry(2);
    const expected = runInputs(board, state, from, [{ steps: [first], count: 2 }]);
    expect(routePhaseOf(snap).tipHeads).toBe(2);
    for (const slot of SLOTS) {
      expect(rayOf(snap, slot), `slot ${String(slot)}`).toHaveLength(
        acceptedRunLength(board, expected.state, first, slot, 2),
      );
    }
  });
});

describe('P35 core — send, cancel and pop are unchanged', () => {
  /** Sixteen heads, two runs of two steps: four moves the engine accepts. */
  const twoRuns = () => {
    const state = openField(from, 16);
    const selected = selectRoute(board, state, from);
    const secondRun = raySlotWalk(geometry, second, 1, 2);
    const target = secondRun[1];
    if (target === undefined) throw new Error('setup: no two step run off the first');
    const snap = clickRuns(selected, [{ arrow: second }, { arrow: target }]);
    return { state, selected, snap, secondRun };
  };

  it('Send emits every run in draft order', () => {
    const { selected, snap } = twoRuns();
    const draft = [...draftOf(snap)];
    expect(draft).toHaveLength(4);
    const sent = selected.mode.send();
    expect(pendingOf(sent)).toEqual(draft);
    expect(sent.phase.kind).toBe('idle');
  });

  it('Cancel applies nothing', () => {
    const state = openField(from, 8);
    const untouched = openField(from, 8);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, third);
    const snap = selected.mode.cancel();
    expect(pendingOf(snap)).toHaveLength(0);
    expect(state).toEqual(untouched);
  });

  it("Popping to a walked arrow restores that run's count control", () => {
    const { selected, snap } = twoRuns();
    const secondExit = exitsOf(draftOf(snap))[1];
    expect(secondExit).toBeDefined();
    if (secondExit === undefined) return;
    const popped = clickArrow(selected, secondExit);
    expect(draftOf(popped)).toHaveLength(2);
    expect(lastRunLengthOf(popped)).toBe(2);
    expect(clickableOf(popped).size).toBeGreaterThan(0);
  });
});
