/**
 * docs/spec/selection-chrome/selection-chrome.edge-cases.feature
 * One it() per Gherkin scenario. Pure helper + GalconInput — no RTL, no jsdom.
 */

import { mintArrowId } from '@conquarrow/contracts';
import { describe, expect, it } from 'vitest';
import { playHighlightsAllowed, victoryFx } from '../src/fx/victory';
import { GalconInput } from '../src/input/modes';
import { reachFrom, reachOpacity } from '../src/reach';
import { refusedConvertExits } from '../src/refusedConvert';
import {
  REACH_WASH_FLOOR,
  REACH_WASH_PEAK,
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
  refusedConvertFixture,
  requireEntry,
  rules,
  sortedIds,
  syntheticSource,
  winnerState,
  withRefused,
} from './selection-chrome.support';

describe('Selection chrome — pointer kind, hover leak, unique full-speed, purity', () => {
  it('Coarse pointer in source phase shows no min-count', () => {
    const { source } = pickSource(2);
    const d2 = destWithMinCount(reachOf(source), 2);
    const paint = paintFor(source, 'coarse', d2);
    expect(paint.reachWash.has(d2)).toBe(true);
    expect(paint.minCountArrows.size).toBe(0);
  });

  it('Coarse pointer after dest tap shows min-count on dest', () => {
    const { mode, state, source } = pickSource(4);
    const d2 = destAtDistance(reachOf(source), 2);
    expect(requireEntry(reachOf(source), d2).minCount).toBe(2);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    if (opened.phase.kind !== 'portion') return;
    const paint = paintFor(opened, 'coarse');
    expect(paint.minCountArrows.size).toBe(1);
    expect(paint.minCountArrows.has(d2)).toBe(true);
  });

  it('Leave hover hides the numeral', () => {
    const { source } = pickSource(2);
    const d2 = destWithMinCount(reachOf(source), 2);
    const hovered = paintFor(source, 'fine', d2);
    expect(hovered.minCountArrows.has(d2)).toBe(true);
    const left = paintFor(source, 'fine');
    expect(left.minCountArrows.size).toBe(0);
  });

  it('Hover a non-reach arrow shows no numeral', () => {
    const { source } = pickSource(2);
    const reach = reachOf(source);
    const outsider = mintArrowId('p31-not-in-reach');
    expect(reach.has(outsider)).toBe(false);
    const paint = paintFor(source, 'fine', outsider);
    expect(paint.reachWash.size).toBeGreaterThan(0);
    expect(paint.minCountArrows.size).toBe(0);
  });

  it('During commit, hovering another dest does not restore reach wash', () => {
    const { from, mode, state, source } = pickSource(4);
    const reach = reachOf(source);
    const d2 = destAtDistance(reach, 2);
    const path = pathTo(reach, d2, requireEntry(reach, d2).maxCount);
    const d3 = destOffPath(reach, path, from);
    const opened = mode.onArrowClick(d2, state, rules);
    expect(opened.phase.kind).toBe('portion');
    if (opened.phase.kind !== 'portion') return;
    const paint = paintFor(opened, 'fine', d3);
    expect(paint.reachWash.size).toBe(0);
    expect(paint.minCountArrows.has(d3)).toBe(false);
    expect(sortedIds(paint.path)).toEqual(sortedIds(path));
  });

  it('Two-to-the-k stack to distance one opens slider', () => {
    const { mode, state, source } = pickSource(4);
    const d1 = destAtDistance(reachOf(source), 1);
    const allowed = allowedOf(requireEntry(reachOf(source), d1));
    expect(allowed).toContain(1);
    expect(allowed).toContain(4);
    const opened = mode.onArrowClick(d1, state, rules);
    expect(opened.phase.kind).toBe('portion');
    if (opened.phase.kind !== 'portion') return;
    expect(portionDialogKind(opened.phase.allowed)).toBe('slider');
    expect(opened.phase.allowed).toContain(1);
    expect(opened.phase.allowed).toContain(4);
  });

  it('Two-to-the-k stack to distance k-plus-one confirms', () => {
    const { mode, state, source } = pickSource(4);
    const d3 = destAtDistance(reachOf(source), 3);
    const entry = requireEntry(reachOf(source), d3);
    expect(allowedOf(entry)).toEqual([4]);
    const opened = mode.onArrowClick(d3, state, rules);
    expect(opened.phase.kind).toBe('portion');
    expect(opened.pending).toBeUndefined();
    expect(commitKind(entry)).toBe('confirm');
    if (opened.phase.kind !== 'portion') return;
    expect(portionDialogKind(opened.phase.allowed)).toBe('confirm');
  });

  it('Confirm skin when allowed length is one', () => {
    expect(portionDialogKind([4])).toBe('confirm');
  });

  it('Slider skin when allowed length is at least two', () => {
    expect(portionDialogKind([1, 2, 4])).toBe('slider');
  });

  it('One-head never opens confirm', () => {
    const { mode, state, from, source } = pickSource(1);
    const reach = reachOf(source);
    expect(reach.size).toBeGreaterThan(0);
    for (const [dest, entry] of reach) {
      expect(allowedOf(entry)).toEqual([1]);
      expect(commitKind(entry)).toBe('apply');
      mode.reset();
      mode.onArrowClick(from, state, rules);
      const committed = mode.onArrowClick(dest, state, rules);
      expect(committed.phase.kind).toBe('idle');
      expect(committed.phase.kind === 'portion').toBe(false);
      const trip = lastStep(committed.pending);
      expect(trip?.exit).toBe(dest);
      expect(trip?.count).toBe(1);
    }
  });

  it('Quiet reach peak and monotone floor', () => {
    expect(REACH_WASH_PEAK).toBe(0.22);
    expect(REACH_WASH_FLOOR).toBe(0.08);
    expect(reachOpacity(1)).toBe(0.22);
    let previous = Number.POSITIVE_INFINITY;
    for (let distance = 1; distance <= 8; distance += 1) {
      const opacity = reachOpacity(distance);
      expect(opacity).toBeLessThanOrEqual(previous);
      expect(opacity).toBeGreaterThanOrEqual(0.08);
      previous = opacity;
    }
  });

  it('Equal snapshots paint equal min-count sets', () => {
    const from = mintArrowId('p31-from');
    const d1 = mintArrowId('p31-d1');
    const d2 = mintArrowId('p31-d2');
    const cheap = entryWithPortions([1]);
    const priced: ReturnType<typeof entryWithPortions> = {
      ...entryWithPortions([2]),
      distance: 2,
      minCount: 2,
      maxCount: 2,
    };
    const phase = { kind: 'source' as const, from };
    const left = selectionPaint({
      phase,
      highlights: syntheticSource(from, [
        [d1, cheap],
        [d2, priced],
      ]),
      pointer: 'fine',
      hoverArrow: d2,
    });
    const right = selectionPaint({
      phase,
      highlights: syntheticSource(from, [
        [d2, priced],
        [d1, cheap],
      ]),
      pointer: 'fine',
      hoverArrow: d2,
    });
    expect(sortedIds(left.minCountArrows)).toEqual(sortedIds(right.minCountArrows));
    expect(sortedIds(left.reachWash)).toEqual(sortedIds(right.reachWash));
    expect(sortedIds(left.minCountArrows)).toEqual([String(d2)]);
    expect(sortedIds(left.reachWash)).toEqual([String(d1), String(d2)].toSorted());
  });

  it('Refused self-convert wash still paints in source phase', () => {
    const { state, from, refused } = refusedConvertFixture();
    const mode = new GalconInput(geometry);
    const selected = mode.onArrowClick(from, state, rules);
    expect(selected.phase.kind).toBe('source');
    const exits = refusedConvertExits(state, geometry, rules, from);
    expect(exits.has(refused)).toBe(true);
    expect(reachFrom(geometry, rules, state, from).has(refused)).toBe(false);
    const highlights = withRefused(selected.highlights, exits);
    expect(highlights.refused?.has(refused)).toBe(true);
    const paint = paintFor({ phase: selected.phase, highlights }, 'fine');
    expect(paint.reachWash.has(refused)).toBe(false);
  });

  it('Match-over still drops play chrome', () => {
    const state = winnerState();
    expect(state.winner).toBeDefined();
    expect(playHighlightsAllowed(victoryFx(state, geometry))).toBe(false);
  });
});
