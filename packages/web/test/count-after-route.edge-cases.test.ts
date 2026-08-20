/**
 * P35 edge cases — `docs/spec/count-after-route/count-after-route.edge-cases.feature`.
 *
 * One test per scenario, in feature order, with two exceptions recorded as
 * `it.todo` and reported back to phase 1 rather than guessed at:
 *
 * - *An attack run offers only counts that leave a head behind* and *Combat
 *   lowers the ceiling on the next run* both require **clicking an adjacent
 *   enemy-held arrow while every head stands on the tip**. Invariant 4 says the
 *   rays are measured at the tip's *full* head count, and §6.2's stay-behind
 *   refuses a step that empties the tip — so at full strength that arrow is not
 *   on any ray and cannot be clicked. P34 armed the attack by lowering the carry
 *   *before* the click, which is exactly the gesture this feature removes. Which
 *   count an attack run is offered at is a rule the spec does not state.
 *
 * Two scenarios are encoded with different *numbers* than the feature gives,
 * because the feature's numbers are refused by the engine. Both are called out at
 * the test, and both keep the assertion the scenario is about:
 *
 * - *Two legal counts defeat auto-apply even with a finished tip* uses **3** heads,
 *   not 2. Two heads walking two steps have exactly one legal count (`speed(1) = 1`
 *   cannot walk the second step), which makes it the packet's own `2^k` walking
 *   `k+1` steps case — an auto-apply, not a defeat of one.
 * - the popping scenarios use **16** heads, because `spent` travels with the
 *   movers: a second run of two steps off a tip that has spent two needs 8, so a
 *   "second run of two steps carrying 4" is not a run the engine accepts.
 */

import { describe, expect, it } from 'vitest';
import { endTurn, skip } from '@conquarrow/contracts';
import type { GameState } from '@conquarrow/contracts';
import { refusedConvertExits } from '../src/refusedConvert';
import { autoApplies, buildRouteOffer, routePaint } from '../src/route';
import {
  A,
  B,
  alongSlots,
  arrowAlong,
  carriesOf,
  clickArrow,
  clickRuns,
  clickableOf,
  controlOf,
  controlShown,
  countingRules,
  countsOf,
  countsThatWalk,
  draftOf,
  exitsOf,
  geometry,
  headsOn,
  lastRunLengthOf,
  leastCountThatWalks,
  makeMode,
  openField,
  pendingOf,
  rayOf,
  raySlotWalk,
  readSource,
  refusedConvertFixture,
  routePhaseOf,
  rules,
  runInputs,
  selectOpenField,
  selectRoute,
  sortedIds,
  sourceArrow,
  stateWith,
} from './count-after-route.support';

const board = { geometry, rules };
const from = sourceArrow(geometry);
const first = arrowAlong(geometry, from, 0, 1);
const second = arrowAlong(geometry, from, 0, 2);
const third = arrowAlong(geometry, from, 0, 3);

describe('P35 edge — the floor tracks the distance the run actually covers', () => {
  it.each([1, 2, 3, 4, 5])('The floor at run length %i', (steps) => {
    const state = openField(from, 16);
    const selected = selectRoute(board, state, from);
    const run = raySlotWalk(geometry, from, 0, steps);
    const snap = clickArrow(selected, arrowAlong(geometry, from, 0, steps));
    expect(exitsOf(draftOf(snap)).map(String), `run of ${String(steps)}`).toEqual(
      run.map(String),
    );
    expect(carriesOf(snap)[0]).toBe(leastCountThatWalks(rules, state, from, run));
  });

  it('A one-step run floors at one head', () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, first);
    expect(leastCountThatWalks(rules, state, from, [first])).toBe(1);
    expect(carriesOf(snap)[0]).toBe(1);
  });

  it("A truncated ray's floor is read from the run it actually offers", () => {
    const state = stateWith([
      [from, { owner: A, heads: 16 }],
      [third, { owner: B, heads: 2 }],
    ]);
    const selected = selectRoute(board, state, from);
    // The ray ends before the enemy (§6.2 stay-behind, P34), so the run is two.
    expect(rayOf(selected.snap, 0)).toHaveLength(2);
    const snap = clickArrow(selected, second);
    expect(carriesOf(snap)[0]).toBe(
      leastCountThatWalks(rules, state, from, raySlotWalk(geometry, from, 0, 2)),
    );
    expect(carriesOf(snap)[0]).toBe(2);
  });

  it("A turn arrow's floor counts the turn as a step", () => {
    const state = openField(from, 16);
    const selected = selectRoute(board, state, from);
    const turn = alongSlots(geometry, from, [0, 0, 1]);
    const snap = clickArrow(selected, turn);
    const run = [...raySlotWalk(geometry, from, 0, 2), turn];
    expect(draftOf(snap)).toHaveLength(3);
    expect(carriesOf(snap)[0]).toBe(leastCountThatWalks(rules, state, from, run));
    expect(carriesOf(snap)[0]).toBe(4);
  });
});

describe('P35 edge — a terminal run still gets its count, and nothing more', () => {
  const mergeState = (): GameState =>
    stateWith([
      [from, { owner: A, heads: 8 }],
      [second, { owner: A, heads: 3 }],
    ]);

  const closureState = (): GameState =>
    stateWith([[from, { owner: A, heads: 8 }]], {
      territory: new Map([
        [from, A],
        [second, A],
      ]),
      trails: new Map([[A, new Set([from])]]),
    });

  it('A run ending in a merge offers a count and no extension', () => {
    const selected = selectRoute(board, mergeState(), from);
    const snap = clickArrow(selected, second);
    expect(controlShown(snap)).toBe(true);
    expect(clickableOf(snap).size).toBe(0);
  });

  it('A merge does not auto-apply even though the tip is finished', () => {
    const state = mergeState();
    const untouched = mergeState();
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, second);
    // Not forced: seven counts walk a two step run out of eight heads.
    expect(carriesOf(snap).length).toBeGreaterThan(1);
    expect(pendingOf(snap)).toHaveLength(0);
    expect(snap.phase.kind).toBe('route');
    expect(state).toEqual(untouched);
  });

  it('A run ending in a closure offers a count', () => {
    const selected = selectRoute(board, closureState(), from);
    const snap = clickArrow(selected, second);
    expect(controlShown(snap)).toBe(true);
    expect(clickableOf(snap).size).toBe(0);
    expect(carriesOf(snap).length).toBeGreaterThan(0);
  });

  /**
   * BLOCKED — phase 1 gap. Clicking an adjacent enemy arrow needs a count the
   * engine accepts, and every count at full strength is refused by the
   * stay-behind. The spec does not say what count an attack run is drafted at,
   * nor how such an arrow enters the clickable set once the carry can no longer
   * be lowered before the click.
   */
  it.todo('An attack run offers only counts that leave a head behind');

  it('A lone head is never offered an attack', () => {
    const state = stateWith([
      [from, { owner: A, heads: 1 }],
      [first, { owner: B, heads: 2 }],
    ]);
    const selected = selectRoute(board, state, from);
    expect(clickableOf(selected.snap).has(first)).toBe(false);
    // Non-vacuity: the other two exits are on offer, so this is the rule and not
    // an empty set.
    expect(clickableOf(selected.snap).size).toBeGreaterThan(0);
  });

  it('A one-head stack facing only an enemy reports blocked', () => {
    const exits = geometry.outArrows(geometry.target(from));
    const state = stateWith([
      [from, { owner: A, heads: 1 }],
      ...exits.map((exit) => [exit, { owner: B, heads: 2 }] as const),
    ]);
    const snap = makeMode(board).onArrowClick(from, state, rules);
    expect(snap.phase.kind).toBe('blocked');
    expect(snap.refusal?.reason).toBe('no-exit');
    expect(controlShown(snap)).toBe(false);
  });
});

describe('P35 edge — rewriting the last run re-measures everything downstream of it', () => {
  it("Lowering the last run's count lowers the heads at the tip", () => {
    const selected = selectOpenField(8);
    clickArrow(selected, first);
    const snap = selected.mode.setCarry(3);
    expect(routePhaseOf(snap).tipHeads).toBe(3);
    expect(countsOf(draftOf(snap))).toEqual([3]);
  });

  it("Lowering the last run's count shortens what the tip offers", () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, first);
    const snap = selected.mode.setCarry(2);
    const expected = buildRouteOffer(runInputs(board, state, from, [{ steps: [first], count: 2 }]));
    expect(expected.clickable.size).toBeGreaterThan(0);
    // Two heads arrived, so the offer from the tip is the two-head one.
    expect(countsOf(draftOf(snap))).toEqual([2]);
    expect(routePhaseOf(snap).tipHeads).toBe(2);
    expect(sortedIds(clickableOf(snap).keys())).toEqual(sortedIds(expected.clickable.keys()));
  });

  it("Raising the last run's count lengthens what the tip offers", () => {
    const state = openField(from, 8);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, first);
    const lowered = selected.mode.setCarry(2);
    expect(countsOf(draftOf(lowered))).toEqual([2]);
    const snap = selected.mode.setCarry(8);
    const expected = buildRouteOffer(runInputs(board, state, from, [{ steps: [first], count: 8 }]));
    expect(expected.clickable.size).toBeGreaterThan(0);
    expect(countsOf(draftOf(snap))).toEqual([8]);
    expect(clickableOf(snap).size).toBeGreaterThan(clickableOf(lowered).size);
    expect(sortedIds(clickableOf(snap).keys())).toEqual(sortedIds(expected.clickable.keys()));
  });

  it("Lowering the last run's count leaves a sentry at its start", () => {
    const state = openField(from, 12);
    const selected = selectRoute(board, state, from);
    clickArrow(selected, first);
    selected.mode.setCarry(8);
    const sent = pendingOf(selected.mode.send());
    expect(countsOf(sent)).toEqual([8]);
    let applied = state;
    for (const move of sent) applied = rules.apply(applied, move);
    expect(headsOn(applied, from)).toBe(4);
  });

  it('Two runs at two counts leave two sentries', () => {
    const state = openField(from, 12);
    const selected = selectRoute(board, state, from);
    clickRuns(selected, [
      { arrow: first, count: 8 },
      { arrow: second, count: 4 },
    ]);
    const sent = pendingOf(selected.mode.send());
    expect(countsOf(sent)).toEqual([8, 4]);
    let applied = state;
    for (const move of sent) applied = rules.apply(applied, move);
    expect(headsOn(applied, from)).toBe(4);
    expect(headsOn(applied, first)).toBe(4);
    expect(headsOn(applied, second)).toBe(4);
  });

  it('A merge raises the ceiling on the next run, not on this one', () => {
    const state = stateWith([
      [from, { owner: A, heads: 8 }],
      [first, { owner: A, heads: 3 }],
    ]);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, first);
    expect(routePhaseOf(snap).tipHeads).toBe(11);
    expect(carriesOf(snap).filter((count) => count > 8)).toEqual([]);
    expect(carriesOf(snap)).toEqual(countsThatWalk(rules, state, from, [first]));
  });

  /**
   * BLOCKED — the same phase 1 gap as *An attack run offers only counts that
   * leave a head behind*: the scenario's Given is "has clicked an adjacent arrow
   * holding an enemy stack **with a count of 7**", which asserts that an attack
   * run drafts at the largest offerable count rather than at the tip's full head
   * count (invariant 3). One of the two has to move.
   */
  it.todo('Combat lowers the ceiling on the next run');
});

describe('P35 edge — popping composes with the count without leaking state', () => {
  /** Sixteen heads, two runs of two steps — see the file header on `spent`. */
  const twoRuns = () => {
    const state = openField(from, 16);
    const selected = selectRoute(board, state, from);
    const secondRun = raySlotWalk(geometry, second, 1, 2);
    const target = secondRun[1];
    if (target === undefined) throw new Error('setup: no two step run off the first');
    const snap = clickRuns(selected, [{ arrow: second }, { arrow: target }]);
    return { state, selected, snap };
  };

  it('Popping restores the earlier run as the last run', () => {
    const { state, selected, snap } = twoRuns();
    const popped = clickArrow(selected, second);
    expect(draftOf(snap)).toHaveLength(4);
    expect(lastRunLengthOf(popped)).toBe(2);
    expect(carriesOf(popped)).toEqual(
      countsThatWalk(rules, state, from, raySlotWalk(geometry, from, 0, 2)),
    );
  });

  it('Popping then rewriting edits the restored run', () => {
    const { selected } = twoRuns();
    clickArrow(selected, second);
    const snap = selected.mode.setCarry(6);
    expect(draftOf(snap)).toHaveLength(2);
    expect(countsOf(draftOf(snap))).toEqual([6, 6]);
  });

  it('Popping to the source empties the draft and hides the control', () => {
    const selected = selectOpenField(8);
    clickArrow(selected, second);
    const snap = clickArrow(selected, from);
    expect(draftOf(snap)).toHaveLength(0);
    expect(snap.phase.kind).toBe('route');
    expect(controlShown(snap)).toBe(false);
  });

  it('Popping twice returns to an empty draft', () => {
    const { selected } = twoRuns();
    clickArrow(selected, second);
    const snap = clickArrow(selected, from);
    expect(draftOf(snap)).toHaveLength(0);
    expect(lastRunLengthOf(snap)).toBe(0);
  });

  it('Extending after a pop starts the new run at full strength', () => {
    const { selected } = twoRuns();
    const popped = clickArrow(selected, second);
    expect(routePhaseOf(popped).tipHeads).toBe(16);
    const onward = arrowAlong(geometry, second, 1, 1);
    const snap = clickArrow(selected, onward);
    expect(lastRunLengthOf(snap)).toBe(1);
    expect(countsOf(draftOf(snap))).toEqual([16, 16, 16]);
  });
});

describe('P35 edge — the auto-apply test is exact at its boundaries', () => {
  it('Two legal counts defeat auto-apply even with a finished tip', () => {
    // Three heads, not the feature's two: two heads walking two steps have one
    // legal count, which is an auto-apply rather than a defeat of one.
    const state = openField(from, 3);
    const untouched = openField(from, 3);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, second);
    expect(carriesOf(snap)).toEqual([2, 3]);
    expect(clickableOf(snap).size).toBe(0);
    expect(controlShown(snap)).toBe(true);
    expect(pendingOf(snap)).toHaveLength(0);
    expect(state).toEqual(untouched);
  });

  it('A forced count with a live tip defeats auto-apply', () => {
    // The feature's example (4 heads, 2 steps) is not in fact forced — three
    // counts walk it — but the tip *is* live, and either fact alone is enough to
    // render the control. Both are asserted so the reason is visible.
    const state = openField(from, 4);
    const selected = selectRoute(board, state, from);
    const snap = clickArrow(selected, second);
    expect(clickableOf(snap).size).toBeGreaterThan(0);
    expect(carriesOf(snap)).toEqual(
      countsThatWalk(rules, state, from, raySlotWalk(geometry, from, 0, 2)),
    );
    expect(controlShown(snap)).toBe(true);
    expect(pendingOf(snap)).toHaveLength(0);
  });

  it('A forced count on a second run defeats auto-apply', () => {
    const state = openField(from, 8);
    const untouched = openField(from, 8);
    const selected = selectRoute(board, state, from);
    const snap = clickRuns(selected, [
      { arrow: first },
      { arrow: arrowAlong(geometry, from, 0, 4) },
    ]);
    const phase = routePhaseOf(snap);
    expect(phase.offer.carries).toHaveLength(1);
    expect(phase.offer.clickable.size).toBe(0);
    expect(
      autoApplies({
        draftLength: phase.draft.length,
        lastRunLength: phase.lastRunLength,
        counts: phase.offer.carries,
        clickable: phase.offer.clickable.size,
      }),
    ).toBe(false);
    expect(controlShown(snap)).toBe(true);
    expect(pendingOf(snap)).toHaveLength(0);
    expect(state).toEqual(untouched);
  });

  it('An auto-applied move leaves no route phase behind', () => {
    const selected = selectRoute(board, openField(from, 1), from);
    const snap = clickArrow(selected, first);
    expect(snap.phase.kind).toBe('idle');
    const paint = routePaint({ phase: snap.phase, pointer: 'fine' });
    expect(paint.rayArrows.size).toBe(0);
    expect(paint.turnArrows.size).toBe(0);
    expect(paint.draftArrows).toHaveLength(0);
    expect(paint.reachWash.size).toBe(0);
    expect(paint.tip).toBeUndefined();
  });
});

describe('P35 edge — the rest of the app is undisturbed', () => {
  it('Skip is refused while a draft is open', () => {
    const selected = selectOpenField(8);
    const drafted = clickArrow(selected, second);
    const before = [...draftOf(drafted)];
    const snap = selected.mode.requestSkip(selected.state, rules);
    expect(snap.refusal?.reason).toBe('cannot-skip');
    expect(pendingOf(snap)).toHaveLength(0);
    expect(draftOf(snap)).toEqual(before);
  });

  it('Skip applies to the source with an empty draft', () => {
    const selected = selectOpenField(8);
    expect(selected.phase.draft).toHaveLength(0);
    const snap = selected.mode.requestSkip(selected.state, rules);
    expect(pendingOf(snap)).toEqual([skip(from)]);
  });

  it('Ending the turn discards an open draft', () => {
    const selected = selectOpenField(8);
    clickArrow(selected, second);
    const snap = selected.mode.requestEndTurn();
    expect(pendingOf(snap)).toEqual([endTurn()]);
    expect(snap.phase.kind).toBe('idle');
    expect(controlShown(snap)).toBe(false);
  });

  it('Match over drops the count control', () => {
    const selected = selectOpenField(8);
    const snap = clickArrow(selected, first);
    expect(controlShown(snap)).toBe(true);
    expect(controlShown(snap, { matchOver: true })).toBe(false);
  });

  it('A locked board drops the count control', () => {
    const selected = selectOpenField(8);
    const snap = clickArrow(selected, first);
    expect(controlShown(snap, { inputLocked: true })).toBe(false);
  });

  it('The refused wash still paints', () => {
    const { state, from: source, refused } = refusedConvertFixture();
    const selected = selectRoute(board, state, source);
    expect(refusedConvertExits(state, geometry, rules, source).has(refused)).toBe(true);
    expect(clickableOf(selected.snap).has(refused)).toBe(false);
  });
});

describe('P35 edge — purity, determinism and cost', () => {
  it('Equal inputs produce an equal offer', () => {
    const state = openField(from, 8);
    const left = selectRoute(board, state, from);
    const right = selectRoute(board, state, from);
    const leftSnap = clickArrow(left, second);
    const rightSnap = clickArrow(right, second);
    expect(draftOf(leftSnap)).toEqual(draftOf(rightSnap));
    expect(carriesOf(leftSnap)).toEqual(carriesOf(rightSnap));
    expect(lastRunLengthOf(leftSnap)).toBe(lastRunLengthOf(rightSnap));
    expect(sortedIds(clickableOf(leftSnap).keys())).toEqual(
      sortedIds(clickableOf(rightSnap).keys()),
    );
    expect(controlOf(leftSnap)).toEqual(controlOf(rightSnap));
    const paint = (snap: typeof leftSnap) =>
      routePaint({ phase: routePhaseOf(snap), pointer: 'fine' });
    expect(sortedIds(paint(leftSnap).rayArrows)).toEqual(sortedIds(paint(rightSnap).rayArrows));
  });

  it('The offer is built once per change, not per hover', () => {
    const counting = countingRules(rules);
    const instrumented = { geometry, rules: counting.rules };
    const selected = selectRoute(instrumented, openField(from, 8), from);
    const snap = clickArrow(selected, second);
    const phase = routePhaseOf(snap);
    counting.zero();
    const hovers = [...phase.offer.clickable.keys()].slice(0, 6);
    expect(hovers).toHaveLength(6);
    for (const hoverArrow of hovers) routePaint({ phase, pointer: 'fine', hoverArrow });
    expect(counting.calls).toBe(0);
  });

  it('No clock and no randomness', () => {
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

  it('The last run length never exceeds the draft', () => {
    const selected = selectRoute(board, openField(from, 16), from);
    const clicks = [second, third, first, from, second];
    let snap = selected.snap;
    for (const arrow of clicks) {
      snap = clickArrow(selected, arrow);
      if (snap.phase.kind !== 'route') continue;
      const phase = routePhaseOf(snap);
      expect(phase.lastRunLength, String(arrow)).toBeLessThanOrEqual(phase.draft.length);
      expect(phase.lastRunLength === 0, String(arrow)).toBe(phase.draft.length === 0);
      const lowest = phase.offer.carries[0];
      if (lowest === undefined) continue;
      const counted = selected.mode.setCarry(lowest);
      const after = routePhaseOf(counted);
      expect(after.lastRunLength).toBeLessThanOrEqual(after.draft.length);
    }
  });
});
