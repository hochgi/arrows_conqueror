/**
 * Pluggable hot-seat input — swap modes without touching the board renderer.
 *
 * Galcon: source → destination → portion.
 * HoMM-style: source → destination (preview) → confirm click → portion.
 */

import { endTurn, skip, step } from '@arrows/contracts';
import type { ArrowId, GameState, Move, RulesPort } from '@arrows/contracts';

export type InputPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'source'; readonly from: ArrowId }
  | {
      readonly kind: 'preview';
      readonly from: ArrowId;
      readonly exit: ArrowId;
    }
  | {
      readonly kind: 'portion';
      readonly from: ArrowId;
      readonly exit: ArrowId;
      readonly max: number;
    };

export interface InputHighlights {
  readonly selected?: ArrowId;
  readonly targets: ReadonlySet<ArrowId>;
  readonly preview?: ArrowId;
}

export interface InputSnapshot {
  readonly phase: InputPhase;
  readonly highlights: InputHighlights;
  /** Ready move waiting for the host to apply (after portion chosen). */
  readonly pending?: Move;
}

export interface InputMode {
  readonly id: string;
  readonly label: string;
  reset(): InputSnapshot;
  onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot;
  onBackgroundClick(): InputSnapshot;
  choosePortion(count: number): InputSnapshot;
  /** Skip the selected source group, if any. */
  requestSkip(state: GameState, rules: RulesPort): InputSnapshot;
  requestEndTurn(): InputSnapshot;
}

const emptyHighlights = (): InputHighlights => ({ targets: new Set() });

const idle = (): InputSnapshot => ({
  phase: { kind: 'idle' },
  highlights: emptyHighlights(),
});

const legalStepsFrom = (
  rules: RulesPort,
  state: GameState,
  from: ArrowId,
): readonly Extract<Move, { kind: 'step' }>[] =>
  rules
    .legalMoves(state)
    .filter((m): m is Extract<Move, { kind: 'step' }> => m.kind === 'step' && m.from === from);

const exitsOf = (steps: readonly Extract<Move, { kind: 'step' }>[]): Set<ArrowId> =>
  new Set(steps.map((m) => m.exit));

const maxCountFor = (
  steps: readonly Extract<Move, { kind: 'step' }>[],
  exit: ArrowId,
): number => {
  let max = 0;
  for (const m of steps) {
    if (m.exit === exit && m.count > max) max = m.count;
  }
  return max;
};

const sourceSelected = (
  from: ArrowId,
  state: GameState,
  rules: RulesPort,
): InputSnapshot => {
  const steps = legalStepsFrom(rules, state, from);
  return {
    phase: { kind: 'source', from },
    highlights: { selected: from, targets: exitsOf(steps) },
  };
};

abstract class BaseMode implements InputMode {
  abstract readonly id: string;
  abstract readonly label: string;

  protected snap: InputSnapshot = idle();

  reset(): InputSnapshot {
    this.snap = idle();
    return this.snap;
  }

  onBackgroundClick(): InputSnapshot {
    return this.reset();
  }

  choosePortion(count: number): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind !== 'portion') return this.snap;
    if (!Number.isInteger(count) || count < 1 || count > phase.max) return this.snap;
    this.snap = {
      phase: { kind: 'idle' },
      highlights: emptyHighlights(),
      pending: step(phase.from, phase.exit, count),
    };
    return this.snap;
  }

  requestSkip(state: GameState, rules: RulesPort): InputSnapshot {
    const phase = this.snap.phase;
    if (phase.kind === 'idle') return this.snap;
    const from = phase.from;
    const legal = rules.legalMoves(state).some((m) => m.kind === 'skip' && m.from === from);
    if (!legal) return this.snap;
    this.snap = {
      phase: { kind: 'idle' },
      highlights: emptyHighlights(),
      pending: skip(from),
    };
    return this.snap;
  }

  requestEndTurn(): InputSnapshot {
    this.snap = {
      phase: { kind: 'idle' },
      highlights: emptyHighlights(),
      pending: endTurn(),
    };
    return this.snap;
  }

  abstract onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot;
}

/** Source → destination → portion (SPEC §5 Galcon-like). */
export class GalconInput extends BaseMode {
  readonly id = 'galcon';
  readonly label = 'Galcon';

  override onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind === 'idle' || phase.kind === 'portion') {
      const group = state.groups.get(arrow);
      if (group === undefined || group.owner !== state.activePlayer) {
        this.snap = idle();
        return this.snap;
      }
      this.snap = sourceSelected(arrow, state, rules);
      return this.snap;
    }
    if (phase.kind === 'source') {
      if (arrow === phase.from) {
        this.snap = idle();
        return this.snap;
      }
      const steps = legalStepsFrom(rules, state, phase.from);
      const max = maxCountFor(steps, arrow);
      if (max < 1) {
        // Re-select if clicking another of own groups.
        const group = state.groups.get(arrow);
        if (group !== undefined && group.owner === state.activePlayer) {
          this.snap = sourceSelected(arrow, state, rules);
          return this.snap;
        }
        return this.snap;
      }
      this.snap = {
        phase: { kind: 'portion', from: phase.from, exit: arrow, max },
        highlights: {
          selected: phase.from,
          targets: exitsOf(steps),
          preview: arrow,
        },
      };
      return this.snap;
    }
    return this.snap;
  }
}

/**
 * HoMM-ish: first destination click previews; second click on the same exit
 * opens the portion picker. Easy to replace — only this class owns the confirm.
 */
export class HommInput extends BaseMode {
  readonly id = 'homm';
  readonly label = 'HoMM preview';

  override onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind === 'idle' || phase.kind === 'portion') {
      const group = state.groups.get(arrow);
      if (group === undefined || group.owner !== state.activePlayer) {
        this.snap = idle();
        return this.snap;
      }
      this.snap = sourceSelected(arrow, state, rules);
      return this.snap;
    }
    if (phase.kind === 'source') {
      if (arrow === phase.from) {
        this.snap = idle();
        return this.snap;
      }
      const steps = legalStepsFrom(rules, state, phase.from);
      if (!exitsOf(steps).has(arrow)) {
        const group = state.groups.get(arrow);
        if (group !== undefined && group.owner === state.activePlayer) {
          this.snap = sourceSelected(arrow, state, rules);
          return this.snap;
        }
        return this.snap;
      }
      this.snap = {
        phase: { kind: 'preview', from: phase.from, exit: arrow },
        highlights: {
          selected: phase.from,
          targets: exitsOf(steps),
          preview: arrow,
        },
      };
      return this.snap;
    }
    // phase.kind === 'preview'
    if (arrow !== phase.exit) {
      if (arrow === phase.from) {
        this.snap = idle();
        return this.snap;
      }
      const steps = legalStepsFrom(rules, state, phase.from);
      if (exitsOf(steps).has(arrow)) {
        this.snap = {
          phase: { kind: 'preview', from: phase.from, exit: arrow },
          highlights: {
            selected: phase.from,
            targets: exitsOf(steps),
            preview: arrow,
          },
        };
        return this.snap;
      }
      const group = state.groups.get(arrow);
      if (group !== undefined && group.owner === state.activePlayer) {
        this.snap = sourceSelected(arrow, state, rules);
        return this.snap;
      }
      return this.snap;
    }
    const steps = legalStepsFrom(rules, state, phase.from);
    const max = maxCountFor(steps, phase.exit);
    if (max < 1) return this.snap;
    this.snap = {
      phase: { kind: 'portion', from: phase.from, exit: phase.exit, max },
      highlights: {
        selected: phase.from,
        targets: exitsOf(steps),
        preview: phase.exit,
      },
    };
    return this.snap;
  }
}

export const INPUT_MODE_OPTIONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'galcon', label: 'Galcon' },
  { id: 'homm', label: 'HoMM preview' },
];

export const createInputMode = (id: string): InputMode => {
  if (id === 'homm') return new HommInput();
  return new GalconInput();
};
