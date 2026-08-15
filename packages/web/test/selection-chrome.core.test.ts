/**
 * docs/spec/selection-chrome/selection-chrome.core.feature
 * One it() per Gherkin scenario. Pure helper + GalconInput — no RTL, no jsdom.
 */

import { describe, expect, it } from 'vitest';
import { commitKind, portionDialogKind } from '../src/selectionChrome';
import {
  allowedOf,
  destAtDistance,
  destOffPath,
  destWithMinCount,
  lastStep,
  paintFor,
  pathTo,
  pickSource,
  reachOf,
  requireEntry,
  rules,
  sortedIds,
} from './selection-chrome.support';

describe('Quieter selection chrome — reach, cost, path, selected halo', () => {
  it('Source phase paints quiet reach and no min-count numerals', () => {
    const { from, source } = pickSource(2);
    const reach = reachOf(source);
    const d1 = destAtDistance(reach, 1);
    const d2 = destAtDistance(reach, 2);
    expect(source.phase.kind).toBe('source');
    expect(reach.has(from)).toBe(false);
    const paint = paintFor(source, 'fine');
    expect(paint.reachWash.has(d1)).toBe(true);
    expect(paint.reachWash.has(d2)).toBe(true);
    expect(paint.reachWash.has(from)).toBe(false);
    expect(paint.minCountArrows.size).toBe(0);
  });

  it("Fine hover on a priced dest shows that dest's min-count", () => {
    const { source } = pickSource(2);
    const reach = reachOf(source);
    const d2 = destWithMinCount(reach, 2);
    expect(requireEntry(reach, d2).minCount).toBe(2);
    const paint = paintFor(source, 'fine', d2);
    expect(paint.minCountArrows.size).toBe(1);
    expect(paint.minCountArrows.has(d2)).toBe(true);
    for (const dest of reach.keys()) {
      if (dest !== d2) expect(paint.minCountArrows.has(dest)).toBe(false);
    }
  });

  it('Fine hover on a one-head dest shows no numeral', () => {
    const { source } = pickSource(2);
    const reach = reachOf(source);
    const d1 = destWithMinCount(reach, 1);
    expect(requireEntry(reach, d1).minCount).toBe(1);
    const paint = paintFor(source, 'fine', d1);
    expect(paint.reachWash.has(d1)).toBe(true);
    expect(paint.minCountArrows.size).toBe(0);
  });

  it('Unique one-head trip auto-applies', () => {
    const { mode, state, source } = pickSource(1);
    const reach = reachOf(source);
    const d1 = destAtDistance(reach, 1);
    const entry = requireEntry(reach, d1);
    expect(allowedOf(entry)).toEqual([1]);
    expect(commitKind(entry)).toBe('apply');
    const committed = mode.onArrowClick(d1, state, rules);
    expect(committed.phase.kind).toBe('idle');
    expect(committed.pending).toBeDefined();
    expect(committed.phase.kind === 'portion').toBe(false);
    const trip = lastStep(committed.pending);
    expect(trip?.exit).toBe(d1);
    expect(trip?.count).toBe(1);
    expect(trip?.length).toBe(1);
  });

  it('Unique priced trip opens confirm not slider', () => {
    const { mode, state, source } = pickSource(2);
    const reach = reachOf(source);
    const d2 = destAtDistance(reach, 2);
    const entry = requireEntry(reach, d2);
    expect(allowedOf(entry)).toEqual([2]);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    expect(opened.pending).toBeUndefined();
    expect(commitKind(entry)).toBe('confirm');
    expect(portionDialogKind(allowedOf(entry))).toBe('confirm');
    if (opened.phase.kind !== 'portion') return;
    expect(portionDialogKind(opened.phase.allowed)).toBe('confirm');
    expect(opened.highlights.path?.has(d2)).toBe(true);
    expect(opened.highlights.path?.size).toBe(opened.phase.steps);
  });

  it('Confirm Send applies the unique portion', () => {
    const { mode, state, source } = pickSource(2);
    const d2 = destAtDistance(reachOf(source), 2);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    expect(opened.pending).toBeUndefined();
    if (opened.phase.kind !== 'portion') return;
    expect(opened.phase.allowed).toEqual([2]);
    const sent = mode.choosePortion(2);
    expect(sent.phase.kind).toBe('idle');
    const trip = lastStep(sent.pending);
    expect(trip?.exit).toBe(d2);
    expect(trip?.count).toBe(2);
    expect(trip?.length).toBe(2);
  });

  it('Multi-portion dest opens slider', () => {
    const { mode, state, source } = pickSource(4);
    const reach = reachOf(source);
    const d1 = destAtDistance(reach, 1);
    const entry = requireEntry(reach, d1);
    expect(allowedOf(entry)).toContain(1);
    expect(allowedOf(entry)).toContain(4);
    expect(commitKind(entry)).toBe('slider');
    const opened = mode.onArrowClick(d1, state, rules);
    expect(opened.phase.kind).toBe('portion');
    expect(opened.pending).toBeUndefined();
    if (opened.phase.kind !== 'portion') return;
    expect(portionDialogKind(opened.phase.allowed)).toBe('slider');
  });

  it('Commit dialog open washes only the path', () => {
    const { from, mode, state, source } = pickSource(4);
    const reach = reachOf(source);
    const d2 = destAtDistance(reach, 2);
    const path = pathTo(reach, d2);
    const d3 = destOffPath(reach, path, from);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    if (opened.phase.kind !== 'portion') return;
    const paint = paintFor(opened, 'fine');
    expect(paint.reachWash.size).toBe(0);
    expect(sortedIds(paint.path)).toEqual(sortedIds(path));
    expect(paint.reachWash.has(d3)).toBe(false);
    expect(paint.path.has(d3)).toBe(false);
  });

  it('Selected stack uses halo emphasis', () => {
    const { from, source } = pickSource(2);
    expect(source.phase.kind).toBe('source');
    const paint = paintFor(source, 'fine');
    expect(paint.selected).toBe(from);
    expect(paint.selectedEmphasis).toBe(true);
  });

  it('Cancel confirm applies nothing', () => {
    const { mode, state, source } = pickSource(2);
    const d2 = destAtDistance(reachOf(source), 2);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    expect(opened.pending).toBeUndefined();
    if (opened.phase.kind !== 'portion') return;
    const cancelled = mode.reset();
    expect(cancelled.phase.kind).toBe('idle');
    expect(cancelled.pending).toBeUndefined();
  });
});
