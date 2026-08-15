/**
 * EARS invariants for docs/spec/selection-chrome/selection-chrome.md.
 *
 * Table-driven / small explicit cases in Vitest — this repo has no fast-check
 * (same style as packages/web/test/victory-fx.invariants.test.ts).
 */

import { mintArrowId } from '@conquarrow/contracts';
import { describe, expect, it } from 'vitest';
import { playHighlightsAllowed, victoryFx } from '../src/fx/victory';
import { reachOpacity } from '../src/reach';
import {
  REACH_WASH_FLOOR,
  REACH_WASH_PEAK,
  SELECTED_HALO_STROKE,
  SELECTED_STROKE_WIDTH,
  SELECTED_WASH,
  commitKind,
  portionDialogKind,
  selectionPaint,
} from '../src/selectionChrome';
import {
  allowedOf,
  destAtDistance,
  destOffPath,
  destWithMinCount,
  entryWithPortions,
  geometry,
  lastStep,
  paintFor,
  pathTo,
  pickSource,
  reachOf,
  requireEntry,
  rules,
  selectionChromeSource,
  sortedIds,
  syntheticSource,
  winnerState,
} from './selection-chrome.support';

describe('selection-chrome invariants', () => {
  it('When the input is in source phase, the system shall paint a reach wash on every reachable dest and shall not paint a min-count numeral on any dest that is not the fine-pointer hover.', () => {
    const stacks = [2, 4] as const;
    for (const heads of stacks) {
      const { from, source } = pickSource(heads);
      const reach = reachOf(source);
      expect(source.phase.kind).toBe('source');
      expect(reach.has(from), `heads=${String(heads)} source in dest map`).toBe(false);
      const rest = paintFor(source, 'fine');
      for (const dest of reach.keys()) {
        expect(rest.reachWash.has(dest), `heads=${String(heads)} dest=${String(dest)}`).toBe(true);
      }
      expect(rest.reachWash.has(from)).toBe(false);
      expect(rest.minCountArrows.size).toBe(0);

      const priced = destWithMinCount(reach, 2);
      const hovered = paintFor(source, 'fine', priced);
      expect(hovered.minCountArrows.has(priced)).toBe(true);
      for (const dest of reach.keys()) {
        if (dest !== priced) expect(hovered.minCountArrows.has(dest)).toBe(false);
      }
    }
  });

  it('When the fine pointer hovers a reach dest whose `minCount` is 1, the system shall not paint a min-count numeral.', () => {
    for (const heads of [1, 2, 4] as const) {
      const { source } = pickSource(heads);
      const d1 = destWithMinCount(reachOf(source), 1);
      const paint = paintFor(source, 'fine', d1);
      expect(paint.minCountArrows.size, `heads=${String(heads)}`).toBe(0);
      expect(paint.reachWash.has(d1)).toBe(true);
    }
  });

  it('When the pointer is coarse and the phase is source, the system shall not paint a min-count numeral.', () => {
    const hovers = [
      { heads: 2, pick: (reach: ReturnType<typeof reachOf>) => destWithMinCount(reach, 2) },
      { heads: 4, pick: (reach: ReturnType<typeof reachOf>) => destAtDistance(reach, 2) },
    ] as const;
    for (const row of hovers) {
      const { source } = pickSource(row.heads);
      const dest = row.pick(reachOf(source));
      const paint = paintFor(source, 'coarse', dest);
      expect(paint.minCountArrows.size, `heads=${String(row.heads)}`).toBe(0);
      expect(paint.reachWash.has(dest)).toBe(true);
    }
  });

  it('When a commit dialog is open, the system shall paint path wash on the committed route and shall not paint reach wash on any other dest.', () => {
    const cases = [
      { heads: 2, distance: 1 },
      { heads: 4, distance: 1 },
      { heads: 4, distance: 2 },
    ] as const;
    for (const row of cases) {
      const { from, mode, state, source } = pickSource(row.heads);
      const reach = reachOf(source);
      const dest = destAtDistance(reach, row.distance);
      const path = pathTo(reach, dest, requireEntry(reach, dest).maxCount);
      const other = destOffPath(reach, path, from);
      const opened = mode.onArrowClick(dest, state, rules);
      expect(opened.phase.kind, `heads=${String(row.heads)} d=${String(row.distance)}`).toBe(
        'portion',
      );
      if (opened.phase.kind !== 'portion') continue;
      const paint = paintFor(opened, 'fine', other);
      expect(paint.reachWash.size).toBe(0);
      expect(sortedIds(paint.path)).toEqual(sortedIds(path));
      expect(paint.reachWash.has(other)).toBe(false);
    }
  });

  it('When the allowed set has exactly one portion equal to 1, the system shall apply that trip without opening a dialog.', () => {
    expect(commitKind(entryWithPortions([1]))).toBe('apply');
    expect(portionDialogKind([])).toBe('none');
    const { mode, state, from, source } = pickSource(1);
    const reach = reachOf(source);
    const dests = [...reach.keys()].slice(0, 3);
    expect(dests.length).toBeGreaterThan(0);
    for (const dest of dests) {
      const entry = requireEntry(reach, dest);
      expect(allowedOf(entry)).toEqual([1]);
      expect(commitKind(entry)).toBe('apply');
      mode.reset();
      mode.onArrowClick(from, state, rules);
      const committed = mode.onArrowClick(dest, state, rules);
      expect(committed.phase.kind).toBe('idle');
      expect(committed.pending).toBeDefined();
      expect(lastStep(committed.pending)?.exit).toBe(dest);
    }
  });

  it('When the allowed set has exactly one portion greater than 1, the system shall open a confirm dialog and shall not apply until Send.', () => {
    const rows = [
      { heads: 2, distance: 2, portion: 2 },
      { heads: 4, distance: 3, portion: 4 },
    ] as const;
    for (const row of rows) {
      const { mode, state, source } = pickSource(row.heads);
      const dest = destAtDistance(reachOf(source), row.distance);
      const entry = requireEntry(reachOf(source), dest);
      expect(allowedOf(entry)).toEqual([row.portion]);
      const opened = mode.onArrowClick(dest, state, rules);
      expect(opened.phase.kind, `heads=${String(row.heads)}`).toBe('portion');
      expect(opened.pending).toBeUndefined();
      expect(commitKind(entry)).toBe('confirm');
      if (opened.phase.kind !== 'portion') continue;
      expect(portionDialogKind(opened.phase.allowed)).toBe('confirm');
      const sent = mode.choosePortion(row.portion);
      expect(sent.phase.kind).toBe('idle');
      expect(lastStep(sent.pending)?.count).toBe(row.portion);
      expect(lastStep(sent.pending)?.exit).toBe(dest);
    }
    expect(commitKind(entryWithPortions([2]))).toBe('confirm');
    expect(commitKind(entryWithPortions([4]))).toBe('confirm');
    expect(portionDialogKind([2])).toBe('confirm');
    expect(portionDialogKind([4])).toBe('confirm');
  });

  it('When the allowed set has two or more portions, the system shall open a slider dialog.', () => {
    const rows = [
      { heads: 2, distance: 1 },
      { heads: 4, distance: 1 },
      { heads: 4, distance: 2 },
    ] as const;
    expect(portionDialogKind([1, 2])).toBe('slider');
    expect(portionDialogKind([1, 2, 4])).toBe('slider');
    expect(commitKind(entryWithPortions([1, 4]))).toBe('slider');
    for (const row of rows) {
      const { mode, state, source } = pickSource(row.heads);
      const dest = destAtDistance(reachOf(source), row.distance);
      const entry = requireEntry(reachOf(source), dest);
      expect(allowedOf(entry).length).toBeGreaterThanOrEqual(2);
      expect(commitKind(entry)).toBe('slider');
      const opened = mode.onArrowClick(dest, state, rules);
      expect(opened.phase.kind, `heads=${String(row.heads)} d=${String(row.distance)}`).toBe(
        'portion',
      );
      if (opened.phase.kind !== 'portion') continue;
      expect(portionDialogKind(opened.phase.allowed)).toBe('slider');
      expect(opened.pending).toBeUndefined();
    }
  });

  it('When the selected stack is set and play highlights are allowed, the system shall mark it with selected emphasis (halo + wash), not merely the movable gold outline.', () => {
    expect(SELECTED_HALO_STROKE).toBe('#f4efe4');
    expect(SELECTED_WASH).toBe('rgba(255, 236, 180, 0.30)');
    expect(SELECTED_STROKE_WIDTH).toBe(4.8);
    expect(playHighlightsAllowed(victoryFx(winnerState(), geometry))).toBe(false);
    for (const heads of [1, 2, 4] as const) {
      const { from, source } = pickSource(heads);
      expect(source.highlights.selected).toBe(from);
      const paint = paintFor(source, 'fine');
      expect(paint.selected, `heads=${String(heads)}`).toBe(from);
      expect(paint.selectedEmphasis, `heads=${String(heads)}`).toBe(true);
    }
  });

  it('`reachOpacity(1)` shall equal `REACH_WASH_PEAK` (0.22) and `reachOpacity` shall be monotone non-increasing and never below `REACH_WASH_FLOOR` (0.08).', () => {
    expect(REACH_WASH_PEAK).toBe(0.22);
    expect(REACH_WASH_FLOOR).toBe(0.08);
    expect(reachOpacity(1)).toBe(REACH_WASH_PEAK);
    let previous = Number.POSITIVE_INFINITY;
    for (let distance = 1; distance <= 8; distance += 1) {
      const opacity = reachOpacity(distance);
      expect(opacity).toBeLessThanOrEqual(previous);
      expect(opacity).toBeGreaterThanOrEqual(REACH_WASH_FLOOR);
      previous = opacity;
    }
  });

  it('Equal `selectionPaint` inputs shall yield equal `reachWash` and `minCountArrows` sets.', () => {
    const from = mintArrowId('p31-eq-from');
    const d1 = mintArrowId('p31-eq-d1');
    const d2 = mintArrowId('p31-eq-d2');
    const cheap = entryWithPortions([1]);
    const priced: ReturnType<typeof entryWithPortions> = {
      ...entryWithPortions([2]),
      distance: 2,
      minCount: 2,
      maxCount: 2,
    };
    const pointers = ['fine', 'coarse'] as const;
    for (const pointer of pointers) {
      const hoverArrow = pointer === 'fine' ? d2 : undefined;
      const left = hoverArrow === undefined
        ? selectionPaint({
            phase: { kind: 'source', from },
            highlights: syntheticSource(from, [
              [d1, cheap],
              [d2, priced],
            ]),
            pointer,
          })
        : selectionPaint({
            phase: { kind: 'source', from },
            highlights: syntheticSource(from, [
              [d1, cheap],
              [d2, priced],
            ]),
            pointer,
            hoverArrow,
          });
      const right = hoverArrow === undefined
        ? selectionPaint({
            phase: { kind: 'source', from },
            highlights: syntheticSource(from, [
              [d2, priced],
              [d1, cheap],
            ]),
            pointer,
          })
        : selectionPaint({
            phase: { kind: 'source', from },
            highlights: syntheticSource(from, [
              [d2, priced],
              [d1, cheap],
            ]),
            pointer,
            hoverArrow,
          });
      expect(sortedIds(left.reachWash), pointer).toEqual(sortedIds(right.reachWash));
      expect(sortedIds(left.minCountArrows), pointer).toEqual(sortedIds(right.minCountArrows));
      expect(sortedIds(left.reachWash)).toEqual([String(d1), String(d2)].toSorted());
      if (pointer === 'fine') {
        expect(sortedIds(left.minCountArrows)).toEqual([String(d2)]);
      } else {
        expect(left.minCountArrows.size).toBe(0);
      }
    }
  });

  it('The helper shall not call `Date.now` or `Math.random`.', () => {
    const src = selectionChromeSource();
    expect(src).not.toContain('Date.now');
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('performance.now');
  });

  it('The rules engine shall be unchanged: no edit to `packages/rules-core`.', () => {
    const src = selectionChromeSource();
    expect(src).not.toContain('@conquarrow/rules-core');
    expect(src).not.toContain('rules-core');
    expect(src).not.toContain('rules.apply');
  });
});
