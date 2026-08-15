/**
 * Selection chrome — quieter reach, deferred cost, path-only commit, selected halo.
 *
 * Packet P31. Board / Hud / Galcon consume this helper. Pure: equal phase +
 * highlights + hover + pointer kind → equal paint. No clocks, no RNG.
 */

import type { ArrowId } from '@conquarrow/contracts';
import type { InputHighlights, InputPhase } from './input/modes';
import type { ReachEntry } from './reach';

export type PointerKind = 'fine' | 'coarse';
export type CommitKind = 'apply' | 'confirm' | 'slider';
export type PortionDialogKind = 'slider' | 'confirm' | 'none';

export const REACH_WASH_PEAK = 0.22;
export const REACH_WASH_FLOOR = 0.08;
export const SELECTED_HALO_STROKE = '#f4efe4';
export const SELECTED_WASH = 'rgba(255, 236, 180, 0.30)';
export const SELECTED_STROKE_WIDTH = 4.8;

export const SOURCE_PHASE_HINT =
  'Quiet cyan = reachable · hover or tap a dest for the cost · click to send';
export const PORTION_PHASE_HINT = 'Only the path is lit · Send or cancel';

export interface SelectionPaint {
  readonly selected?: ArrowId;
  readonly reachWash: ReadonlySet<ArrowId>;
  readonly path: ReadonlySet<ArrowId>;
  readonly minCountArrows: ReadonlySet<ArrowId>;
  readonly selectedEmphasis: boolean;
}

const emptyArrows = (): ReadonlySet<ArrowId> => new Set();

const sortedPlanKeys = (entry: ReachEntry): readonly number[] =>
  [...entry.plans.keys()].toSorted((left, right) => left - right);

export const commitKind = (entry: ReachEntry): CommitKind => {
  const allowed = sortedPlanKeys(entry);
  const unique = allowed.length === 1 ? allowed[0] : undefined;
  if (unique === 1) return 'apply';
  if (unique !== undefined) return 'confirm';
  return 'slider';
};

export const portionDialogKind = (allowed: readonly number[]): PortionDialogKind => {
  if (allowed.length === 0) return 'none';
  if (allowed.length === 1) return 'confirm';
  return 'slider';
};

const paintOf = (
  selected: ArrowId | undefined,
  reachWash: ReadonlySet<ArrowId>,
  path: ReadonlySet<ArrowId>,
  minCountArrows: ReadonlySet<ArrowId>,
): SelectionPaint => {
  const rest = {
    reachWash,
    path,
    minCountArrows,
    selectedEmphasis: selected !== undefined,
  };
  return selected === undefined ? rest : { ...rest, selected };
};

const minCountOf = (highlights: InputHighlights, arrow: ArrowId): number =>
  highlights.reach?.get(arrow)?.minCount ?? 0;

const pricedSingleton = (arrow: ArrowId, minCount: number): ReadonlySet<ArrowId> =>
  minCount > 1 ? new Set([arrow]) : emptyArrows();

const reachKeysExceptSelected = (highlights: InputHighlights): ReadonlySet<ArrowId> => {
  const keys = new Set<ArrowId>();
  const selected = highlights.selected;
  if (highlights.reach === undefined) return keys;
  for (const arrow of highlights.reach.keys()) {
    if (arrow !== selected) keys.add(arrow);
  }
  return keys;
};

const sourceMinCountArrows = (
  highlights: InputHighlights,
  reachKeys: ReadonlySet<ArrowId>,
  pointer: PointerKind,
  hoverArrow: ArrowId | undefined,
): ReadonlySet<ArrowId> => {
  if (pointer !== 'fine' || hoverArrow === undefined || !reachKeys.has(hoverArrow)) {
    return emptyArrows();
  }
  return pricedSingleton(hoverArrow, minCountOf(highlights, hoverArrow));
};

export const selectionPaint = (opts: {
  readonly phase: InputPhase;
  readonly highlights: InputHighlights;
  readonly hoverArrow?: ArrowId;
  readonly pointer: PointerKind;
}): SelectionPaint => {
  const { phase, highlights, pointer } = opts;
  const selected = highlights.selected;
  const path = highlights.path ?? emptyArrows();
  if (phase.kind === 'portion') {
    return paintOf(
      selected,
      emptyArrows(),
      path,
      pricedSingleton(phase.exit, minCountOf(highlights, phase.exit)),
    );
  }
  if (phase.kind === 'source') {
    const reachKeys = reachKeysExceptSelected(highlights);
    return paintOf(
      selected,
      reachKeys,
      path,
      sourceMinCountArrows(highlights, reachKeys, pointer, opts.hoverArrow),
    );
  }
  return paintOf(selected, emptyArrows(), path, emptyArrows());
};
