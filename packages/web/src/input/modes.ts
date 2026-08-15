/**
 * Hot-seat input — Galcon: source → destination → portion.
 *
 * A destination is anywhere the stack can get **this turn**, not just one step away
 * (see `reach.ts`). §3 buys distance with heads, so the portion picker opens at the
 * fewest heads that can make the trip rather than at 1 — asking for a portion that
 * cannot arrive is the fastest way to make a correct rule look broken.
 */

import { endTurn, skip } from '@conquarrow/contracts';
import type { ArrowId, GameState, GeometryPort, Move, RulesPort } from '@conquarrow/contracts';
import { pathForDestination, planMoves, reachFrom } from '../reach';
import type { Reach, ReachEntry } from '../reach';
import { commitKind } from '../selectionChrome';

export type InputPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'source'; readonly from: ArrowId }
  | { readonly kind: 'blocked'; readonly from: ArrowId }
  | {
      readonly kind: 'portion';
      readonly from: ArrowId;
      readonly exit: ArrowId;
      /** Fewest heads that arrive — the slider's floor, not 1. */
      readonly min: number;
      readonly max: number;
      /** How many steps the trip takes, for the dialog to say so. */
      readonly steps: number;
      /** Portions that actually arrive, ascending. Normally `min..max`. */
      readonly allowed: readonly number[];
    };

export interface InputHighlights {
  readonly selected?: ArrowId;
  readonly targets: ReadonlySet<ArrowId>;
  readonly preview?: ArrowId;
  /** Everything the selected stack can reach, with distance and price. */
  readonly reach?: Reach;
  /**
   * Arrows on the route that will be applied for the current preview / portion.
   * Empty when no destination is committed yet.
   */
  readonly path?: ReadonlySet<ArrowId>;
  /**
   * Grain-adjacent self-convert exits of the selected stack (P28). Painted as a
   * refused wash — not reach, not a click target.
   */
  readonly refused?: ReadonlySet<ArrowId>;
}

export interface InputSnapshot {
  readonly phase: InputPhase;
  readonly highlights: InputHighlights;
  /** Moves waiting for the host to apply, in order. A trip may be several steps. */
  readonly pending?: readonly Move[];
}

export interface InputMode {
  readonly id: string;
  readonly label: string;
  reset(): InputSnapshot;
  onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot;
  onBackgroundClick(): InputSnapshot;
  choosePortion(count: number): InputSnapshot;
  /** Refresh the path highlight as the portion slider moves. */
  previewPortion(count: number): InputSnapshot;
  /** Skip the selected source group, if any. */
  requestSkip(state: GameState, rules: RulesPort): InputSnapshot;
  requestEndTurn(): InputSnapshot;
}

const emptyHighlights = (): InputHighlights => ({ targets: new Set() });

const idle = (): InputSnapshot => ({
  phase: { kind: 'idle' },
  highlights: emptyHighlights(),
});

const isOwn = (arrow: ArrowId, state: GameState): boolean =>
  state.groups.get(arrow)?.owner === state.activePlayer;

const pathFor = (reach: Reach, exit: ArrowId, count: number): ReadonlySet<ArrowId> =>
  pathForDestination(reach, exit, count);

const withoutSource = (from: ArrowId, reach: Reach): Reach => {
  if (!reach.has(from)) return reach;
  const trimmed = new Map(reach);
  trimmed.delete(from);
  return trimmed;
};

abstract class BaseMode implements InputMode {
  abstract readonly id: string;
  abstract readonly label: string;

  protected snap: InputSnapshot = idle();
  /** The reach of the current selection, kept so a click does not recompute it. */
  protected reach: Reach = new Map();

  constructor(protected readonly geometry: GeometryPort) {}

  reset(): InputSnapshot {
    this.reach = new Map();
    this.snap = idle();
    return this.snap;
  }

  onBackgroundClick(): InputSnapshot {
    return this.reset();
  }

  /** Select `from`, or report it stuck when nothing is reachable. */
  protected select(from: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    // A hop that lands back on the source is not a Galcon dest — clicking it
    // deselects — and selected chrome is the halo, not a reach wash.
    this.reach = withoutSource(from, reachFrom(this.geometry, rules, state, from));
    const targets = new Set(this.reach.keys());
    this.snap =
      targets.size === 0
        ? { phase: { kind: 'blocked', from }, highlights: { selected: from, targets } }
        : {
            phase: { kind: 'source', from },
            highlights: { selected: from, targets, reach: this.reach },
          };
    return this.snap;
  }

  /** Auto-apply a unique 1-head trip, or open the commit dialog (confirm / slider). */
  protected openPortion(from: ArrowId, exit: ArrowId, entry: ReachEntry): InputSnapshot {
    const allowed = [...entry.plans.keys()].toSorted((left, right) => left - right);
    if (commitKind(entry) === 'apply') {
      const portion = allowed[0];
      if (portion === undefined) return this.snap;
      const plan = entry.plans.get(portion);
      if (plan === undefined) return this.snap;
      this.snap = {
        phase: { kind: 'idle' },
        highlights: emptyHighlights(),
        pending: planMoves(from, plan, portion),
      };
      this.reach = new Map();
      return this.snap;
    }
    this.snap = {
      phase: {
        kind: 'portion',
        from,
        exit,
        min: entry.minCount,
        max: entry.maxCount,
        steps: entry.distance,
        allowed,
      },
      highlights: {
        selected: from,
        targets: new Set(this.reach.keys()),
        preview: exit,
        reach: this.reach,
        // Slider defaults to the largest allowed portion; paint that path from frame 0.
        path: pathFor(this.reach, exit, allowed[allowed.length - 1] ?? entry.minCount),
      },
    };
    return this.snap;
  }

  choosePortion(count: number): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind !== 'portion') return this.snap;
    if (!phase.allowed.includes(count)) return this.snap;
    const plan = this.reach.get(phase.exit)?.plans.get(count);
    if (plan === undefined) return this.snap;
    this.snap = {
      phase: { kind: 'idle' },
      highlights: emptyHighlights(),
      pending: planMoves(phase.from, plan, count),
    };
    this.reach = new Map();
    return this.snap;
  }

  previewPortion(count: number): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind !== 'portion') return this.snap;
    if (!phase.allowed.includes(count)) return this.snap;
    this.snap = {
      ...this.snap,
      highlights: {
        ...this.snap.highlights,
        path: pathFor(this.reach, phase.exit, count),
      },
    };
    return this.snap;
  }

  requestSkip(state: GameState, rules: RulesPort): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind === 'idle') return this.snap;
    const { from } = phase;
    if (!rules.legalMoves(state).some((m) => m.kind === 'skip' && m.from === from)) {
      return this.snap;
    }
    this.snap = { phase: { kind: 'idle' }, highlights: emptyHighlights(), pending: [skip(from)] };
    this.reach = new Map();
    return this.snap;
  }

  requestEndTurn(): InputSnapshot {
    this.snap = { phase: { kind: 'idle' }, highlights: emptyHighlights(), pending: [endTurn()] };
    this.reach = new Map();
    return this.snap;
  }

  /**
   * The clicks every mode shares: pick up one of your own stacks, drop the selection
   * by clicking it again, and ignore anything that is neither.
   */
  protected common(
    arrow: ArrowId,
    state: GameState,
    rules: RulesPort,
    from: ArrowId | undefined,
  ): InputSnapshot | undefined {
    if (from !== undefined && arrow === from) return this.reset();
    if (isOwn(arrow, state)) return this.select(arrow, state, rules);
    return undefined;
  }

  abstract onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot;
}

/** Source → destination → portion (SPEC §4 Galcon-like). */
export class GalconInput extends BaseMode {
  readonly id = 'galcon';
  readonly label = 'Galcon';

  override onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind === 'source') {
      const entry = this.reach.get(arrow);
      if (entry !== undefined && arrow !== phase.from) {
        return this.openPortion(phase.from, arrow, entry);
      }
    }
    const from = phase.kind === 'idle' ? undefined : phase.from;
    return this.common(arrow, state, rules, from) ?? this.snap;
  }
}

/** Sole hot-seat input mode. */
export const createInputMode = (geometry: GeometryPort): InputMode => new GalconInput(geometry);
