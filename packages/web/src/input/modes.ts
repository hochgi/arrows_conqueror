/**
 * Hot-seat input — draft a route from straight runs, then send it (P34).
 *
 * Selecting a stack opens the `route` phase: the three **rays** light up, a click
 * appends a straight **run** to a drafted route, and the tip moves there. Nothing
 * touches the board until Send, so every arrow of the trail was named by a click
 * rather than picked by `outArrows` iteration order — which is the whole point,
 * because the trail *is* the move (§5–§7).
 *
 * The measurement lives in `route.ts`; this module is the state machine. It holds
 * the live board it was last clicked against, because `setCarry` and `send` are
 * called without one.
 */

import { endTurn, skip, step } from '@conquarrow/contracts';
import type { ArrowId, GameState, GeometryPort, Move, RulesPort } from '@conquarrow/contracts';
import type { RefusalReason } from '../fx/present';
import {
  buildRouteOffer,
  draftExits,
  isTerminalStep,
  runMoves,
  type RouteOffer,
  type RouteOption,
} from '../route';

/**
 * Drafting a route (P34): the source, the run-by-run draft, and the tip it grows
 * from. `portion` is retired by this phase — a destination click no longer opens
 * a modal, because there is no destination to disambiguate.
 *
 * Nothing here is applied to the board. `draft` is a list of `step` moves waiting
 * for Send.
 */
export interface RoutePhase {
  readonly kind: 'route';
  /** The original source arrow. Clicking it with an empty draft deselects. */
  readonly from: ArrowId;
  /** Last arrow the draft walks, or `from` when the draft is empty. */
  readonly tip: ArrowId;
  /**
   * The count on the **last drafted run** (P35).
   *
   * No longer a value carried forward across runs: the count is asked *after*
   * the click, so it addresses the run behind it. With an empty draft it is the
   * tip's head count, so nothing reads a stale number.
   */
  readonly carry: number;
  /** Heads standing on the tip after the draft — read off the state, not the carry. */
  readonly tipHeads: number;
  readonly draft: readonly Move[];
  /**
   * One entry per run, in order, summing to `draft.length` (P35).
   *
   * This is what lets the count control rewrite exactly one run: drop the
   * trailing `runLengths[last]` moves, re-emit them at the new count, rebuild. A
   * run is defined by the click that made it, and a flat `Move[]` does not record
   * where a click ended.
   *
   * A single trailing length would not do: popping back to a boundary *before*
   * the last run has to restore the earlier run as the editable one, and a scalar
   * does not record that history. `lastRunLength` is therefore derived from this
   * list, never stored. A pop into the middle of a run truncates that run — the
   * surviving part becomes the last entry.
   */
  readonly runLengths: readonly number[];
  /** Built once per selection, extend, pop and carry change — never per hover. */
  readonly offer: RouteOffer;
}

export type InputPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'blocked'; readonly from: ArrowId }
  | RoutePhase;

export interface InputHighlights {
  readonly selected?: ArrowId;
  /** The clickable set — unique-route arrows from the tip. */
  readonly targets: ReadonlySet<ArrowId>;
  /**
   * Grain-adjacent self-convert exits of the selected stack (P28). Painted as a
   * refused wash — not reach, not a click target.
   */
  readonly refused?: ReadonlySet<ArrowId>;
}

export interface InputSnapshot {
  readonly phase: InputPhase;
  readonly highlights: InputHighlights;
  /** Moves waiting for the host to apply, in order. A route is several steps. */
  readonly pending?: readonly Move[];
  /**
   * A click that could not do anything, and where (Event 11).
   *
   * One-shot: it rides on the snapshot the refused click produced and is never
   * carried into the next one, so the same refusal cannot re-fire on a later
   * no-op. Silence used to be the whole answer here — a player learned the
   * constraint by guessing.
   */
  readonly refusal?: { readonly arrow: ArrowId; readonly reason: RefusalReason };
}

export interface InputMode {
  readonly id: string;
  readonly label: string;
  reset(): InputSnapshot;
  onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot;
  onBackgroundClick(): InputSnapshot;
  /**
   * Set the carry at the tip, forward only (P34).
   *
   * Repaints the offer — fewer heads, shorter rays — and never rewrites a move
   * already in the draft. Retroactive splitting would silently trim a drawn tail.
   */
  setCarry(count: number): InputSnapshot;
  /** Emit the draft as `pending`, in draft order, and return to idle. */
  send(): InputSnapshot;
  /** Discard the draft and return to idle — Cancel, background click, Escape. */
  cancel(): InputSnapshot;
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

const headsOn = (state: GameState, arrow: ArrowId): number =>
  state.groups.get(arrow)?.heads ?? 0;

/** The board a click was last made against — `setCarry` / `send` carry no state. */
interface Board {
  readonly state: GameState;
  readonly rules: RulesPort;
}

/** The scratch state after a draft, and whether its last step was terminal. */
interface Walked {
  readonly state: GameState;
  readonly terminal: boolean;
}

/**
 * Walk the draft on a scratch state.
 *
 * Terminality is measured *here*, hop by hop, because the state after the draft
 * cannot tell: combat has already destroyed the heads that would give it away
 * (`route.ts`'s `RouteInputs.terminal`).
 */
const walkDraft = (board: Board, draft: readonly Move[]): Walked => {
  let state = board.state;
  let terminal = false;
  for (const move of draft) {
    if (move.kind !== 'step') continue;
    const before = state;
    state = board.rules.apply(before, move);
    terminal = isTerminalStep(before, state, move);
  }
  return { state, terminal };
};

abstract class BaseMode implements InputMode {
  abstract readonly id: string;
  abstract readonly label: string;

  protected snap: InputSnapshot = idle();
  /** The board the last click was made against. Undefined until the first one. */
  private board: Board | undefined;

  constructor(protected readonly geometry: GeometryPort) {}

  reset(): InputSnapshot {
    this.snap = idle();
    return this.snap;
  }

  onBackgroundClick(): InputSnapshot {
    return this.reset();
  }

  /**
   * Enter (or repaint) the route phase for a draft.
   *
   * `carry` is forward-only and never larger than the heads standing on the new
   * tip: `undefined` means "every head there", which is what a selection wants; an
   * extend and a pop pass the current carry through, clamped. So combat shrinking
   * the count shrinks the carry with it, while a **merge** growing it does not
   * raise the carry — those heads belong to the group that was merged into, whose
   * allowance is a different group's (§3), and a merge ends the draft anyway.
   */
  protected enterRoute(
    from: ArrowId,
    draft: readonly Move[],
    carry: number | undefined,
  ): InputSnapshot {
    const board = this.board;
    if (board === undefined) return this.snap;
    const walked = walkDraft(board, draft);
    const exits = draftExits(draft);
    const tip = exits[exits.length - 1] ?? from;
    const tipHeads = headsOn(walked.state, tip);
    const offer = buildRouteOffer({
      geometry: this.geometry,
      rules: board.rules,
      state: walked.state,
      from,
      tip,
      draft,
      carry: Math.min(carry ?? tipHeads, tipHeads),
      tipHeads,
      terminal: walked.terminal,
    });
    this.snap = {
      // P35 skeleton: run boundaries are not tracked yet, so `runLengths` holds
      // the empty-draft value until the count control is implemented.
      phase: { kind: 'route', from, tip, carry: offer.carry, tipHeads, draft, runLengths: [], offer },
      highlights: { selected: from, targets: new Set(offer.clickable.keys()) },
    };
    return this.snap;
  }

  /** Select `from`, or report it stuck when nothing is clickable. */
  protected select(from: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    this.board = { state, rules };
    const opened = this.enterRoute(from, [], undefined);
    if (opened.phase.kind === 'route' && opened.phase.offer.clickable.size > 0) return opened;
    this.snap = {
      phase: { kind: 'blocked', from },
      highlights: { selected: from, targets: new Set() },
    };
    return { ...this.snap, refusal: { arrow: from, reason: 'no-exit' } };
  }

  /** Append a run (and its optional final turn) to the draft, and move the tip. */
  private extend(phase: RoutePhase, option: RouteOption): InputSnapshot {
    const moves = runMoves(phase.tip, option.steps, phase.carry);
    return this.enterRoute(phase.from, [...phase.draft, ...moves], phase.carry);
  }

  /** Truncate the draft to the prefix ending at `arrow`; the carry rides along. */
  private popTo(phase: RoutePhase, arrow: ArrowId): InputSnapshot {
    if (arrow === phase.from) return this.enterRoute(phase.from, [], phase.carry);
    const index = draftExits(phase.draft).indexOf(arrow);
    if (index < 0) return this.snap;
    return this.enterRoute(phase.from, phase.draft.slice(0, index + 1), phase.carry);
  }

  setCarry(count: number): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind !== 'route') return this.snap;
    if (!phase.offer.carries.includes(count)) return this.snap;
    return this.enterRoute(phase.from, phase.draft, count);
  }

  send(): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind !== 'route' || phase.draft.length === 0) return this.snap;
    this.snap = {
      phase: { kind: 'idle' },
      highlights: emptyHighlights(),
      pending: [...phase.draft],
    };
    return this.snap;
  }

  cancel(): InputSnapshot {
    return this.reset();
  }

  requestSkip(state: GameState, rules: RulesPort): InputSnapshot {
    const { phase } = this.snap;
    if (phase.kind === 'idle') return this.snap;
    const { from } = phase;
    // A skip is a decision about the *source*; with a route drawn it would throw
    // the draft away without saying so, which is what Cancel is for.
    const drafting = phase.kind === 'route' && phase.draft.length > 0;
    if (drafting || !rules.legalMoves(state).some((m) => m.kind === 'skip' && m.from === from)) {
      return { ...this.snap, refusal: { arrow: from, reason: 'cannot-skip' } };
    }
    this.snap = { phase: { kind: 'idle' }, highlights: emptyHighlights(), pending: [skip(from)] };
    return this.snap;
  }

  requestEndTurn(): InputSnapshot {
    this.snap = { phase: { kind: 'idle' }, highlights: emptyHighlights(), pending: [endTurn()] };
    return this.snap;
  }

  /**
   * Why a click on `arrow` did nothing.
   *
   * `needs-stay-behind` when an adjacent enemy arrow is unofferable *only* because
   * the whole carry leaving would empty the tip (§6.2 / §11 item 38) — measured,
   * by asking the engine for the same hop with one head left behind. Naming the
   * fix beats "too far", which is what the reach test would say.
   */
  private refusalFor(phase: RoutePhase, arrow: ArrowId): RefusalReason {
    const board = this.board;
    if (board === undefined) return 'out-of-reach';
    const walked = walkDraft(board, phase.draft);
    const holder = walked.state.groups.get(arrow)?.owner;
    const adjacent = this.geometry
      .outArrows(this.geometry.target(phase.tip))
      .includes(arrow);
    if (!adjacent || holder === undefined || holder === walked.state.activePlayer) {
      return 'out-of-reach';
    }
    const sentry = phase.tipHeads - 1;
    if (sentry < 1) return 'out-of-reach';
    try {
      board.rules.apply(walked.state, step(phase.tip, arrow, sentry));
    } catch {
      return 'out-of-reach';
    }
    return 'needs-stay-behind';
  }

  /** The clicks a route draft answers: extend, pop, deselect. */
  protected onRouteClick(
    phase: RoutePhase,
    arrow: ArrowId,
    state: GameState,
    rules: RulesPort,
  ): InputSnapshot {
    if (arrow === phase.from && phase.draft.length === 0) return this.reset();
    if (arrow === phase.from || draftExits(phase.draft).includes(arrow)) {
      return this.popTo(phase, arrow);
    }
    const option = phase.offer.clickable.get(arrow);
    // Before the own-stack idiom: a clickable arrow holding your own heads is a
    // merge the run may end on (§3), not another stack to pick up.
    if (option !== undefined) return this.extend(phase, option);
    if (isOwn(arrow, state)) return this.select(arrow, state, rules);
    return this.refuse(arrow, this.refusalFor(phase, arrow));
  }

  /** The snapshot to return for a click that did nothing, plus why. */
  protected refuse(arrow: ArrowId, reason: RefusalReason): InputSnapshot {
    return { ...this.snap, refusal: { arrow, reason } };
  }

  onArrowClick(arrow: ArrowId, state: GameState, rules: RulesPort): InputSnapshot {
    this.board = { state, rules };
    const { phase } = this.snap;
    if (phase.kind === 'route') return this.onRouteClick(phase, arrow, state, rules);
    if (phase.kind === 'blocked' && arrow === phase.from) return this.reset();
    if (isOwn(arrow, state)) return this.select(arrow, state, rules);
    // Nothing happened, so say what stopped it *at the tile that was clicked*:
    // nothing is selected and this is not a stack of yours to pick up.
    return this.refuse(arrow, phase.kind === 'blocked' ? 'out-of-reach' : 'not-yours');
  }
}

/** Route drafting: pick a stack, click along the rays, send (SPEC §5). */
export class GalconInput extends BaseMode {
  readonly id = 'galcon';
  readonly label = 'Galcon';
}

/** Sole hot-seat input mode. */
export const createInputMode = (geometry: GeometryPort): InputMode => new GalconInput(geometry);
