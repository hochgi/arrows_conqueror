/**
 * Ray-run route drafting — what is clickable from the tip, and how it paints.
 *
 * Packet P34. `docs/spec/ray-run-input/ray-run-input.md`.
 *
 * A route is a **word over three out-slots**. Because the three out-directions
 * sum to zero, a shortest route's prefix uses at most two of them, and a
 * destination fixes the word's last letter — so a destination has exactly one
 * route **iff** its word is `s^m` or `s^m·e`: straight along one slot, then
 * optionally one turn at the end. That set is what this module offers, which is
 * why no route is ever picked by the adapter: every arrow of the draft was named
 * by a click.
 *
 * There is deliberately **no `remaining <= 2` special case**. Everything within
 * two steps has word `s·e`, a prefix of length one, so the general rule already
 * covers it.
 *
 * **Measured, never derived.** Every hop is offered only because `rules.apply`
 * accepted it on a scratch state, exactly as `reach.ts` already does.
 * `speed(carry)` and {@link MAX_DEPTH} only *bound* the search; the engine
 * decides every step, so a rule change moves the offer with it.
 *
 * Pure: equal state + tip + carry + draft produce equal rays, turn arrows and
 * paint. No clock, no randomness.
 *
 * @see docs/spec/ray-run-input/ray-run-input.md
 */

import { speed, step } from '@conquarrow/contracts';
import type {
  ArrowId,
  GameState,
  GeometryPort,
  Move,
  RulesPort,
  StepMove,
} from '@conquarrow/contracts';
import type { InputPhase } from './input/modes';
import { reachFrom } from './reach';
import type { PointerKind } from './selectionChrome';

/** A depth cap, so a pathological board cannot spin the renderer. As `reach.ts`. */
export const MAX_DEPTH = 8;

/**
 * An index into `outArrows(point)` — 0, 1 or 2.
 *
 * Not `contracts`' `Slot`, which is one of the *six* cyclic positions at a point
 * and carries no direction (P02 D1 / §11 item 29). A ray is "keep taking the
 * same out-slot", and on the generated tiling `outArrows(point)[k]` is the arrow
 * of grain `k` — so slot-consistency is the rule and straightness is a tiling
 * property. This packet adds no grain accessor to `GeometryPort`.
 */
export type RaySlot = 0 | 1 | 2;

export const RAY_SLOTS: readonly RaySlot[] = [0, 1, 2];

/** `ray` for word `s^m`; `turn` for `s^m·e` — the one free turn at the end. */
export type OptionKind = 'ray' | 'turn';

/** One clickable arrow, and the single run (plus optional turn) that reaches it. */
export interface RouteOption {
  readonly arrow: ArrowId;
  readonly kind: OptionKind;
  /** The slot the run took. A turn arrow names its *ray's* slot, not the turn's. */
  readonly slot: RaySlot;
  /** Exits to walk from the tip, in order. The last one is `arrow`. */
  readonly steps: readonly ArrowId[];
}

/** Ray arrows and turn arrows, keyed by arrow. Provably the unique-route set. */
export type ClickableSet = ReadonlyMap<ArrowId, RouteOption>;

/**
 * Everything a measurement needs: the scratch state after the draft, where the
 * tip is, and how many heads travel from it.
 */
export interface RouteInputs {
  readonly geometry: GeometryPort;
  readonly rules: RulesPort;
  /** The scratch state **after** the draft has been walked. Never the live board. */
  readonly state: GameState;
  /** The original source. Clicking it deselects (empty draft) or pops. */
  readonly from: ArrowId;
  /** Last arrow the draft walks, or `from` when the draft is empty. */
  readonly tip: ArrowId;
  /** The draft so far, in order. Applied to nothing. */
  readonly draft: readonly Move[];
  /** Heads travelling from the tip. The rest stay as a sentry (§5). */
  readonly carry: number;
  /** Heads standing on the tip in `state` — read off the state, not the carry. */
  readonly tipHeads: number;
  /**
   * Did the draft's **last** step merge, close or resolve combat?
   *
   * Not derivable here: `state` is the board *after* the draft, and combat has
   * already destroyed the heads that would give the diff away. The caller holds
   * the pre-draft board and measures it with {@link isTerminalStep} as it walks —
   * so it is passed in rather than re-derived. Absent means "no draft, or an
   * ordinary hop", which is the common case.
   */
  readonly terminal?: boolean;
}

/** The whole offer from one tip, built once per selection / extend / pop / carry. */
export interface RouteOffer {
  readonly tip: ArrowId;
  readonly carry: number;
  /** Indexed by out-slot; always length 3. Truncated where the engine stops. */
  readonly rays: readonly (readonly ArrowId[])[];
  readonly clickable: ClickableSet;
  /** Carries that can make at least one hop from the tip, ascending. */
  readonly carries: readonly number[];
  /** The faint tier: reachable with this carry, minus every louder tier. */
  readonly reachWash: ReadonlySet<ArrowId>;
  /**
   * Per clickable arrow, the set that would be clickable from *there*.
   *
   * Built with the offer so hover is a map lookup. Recomputing reach per hovered
   * arrow is what would make this model feel broken.
   */
  readonly previews: ReadonlyMap<ArrowId, ClickableSet>;
}

/** Three tiers plus the tip, quietest first. */
export interface RoutePaint {
  readonly reachWash: ReadonlySet<ArrowId>;
  readonly rayArrows: ReadonlySet<ArrowId>;
  readonly turnArrows: ReadonlySet<ArrowId>;
  /** The draft, in walk order — the strongest mark. */
  readonly draftArrows: readonly ArrowId[];
  readonly hoverPreview: ReadonlySet<ArrowId>;
  readonly tip?: ArrowId;
}

export const ROUTE_HINT_EMPTY =
  'Click along a ray to walk straight · one turn at the end is free';
export const ROUTE_HINT_DRAFTED =
  'Click to extend · click a walked arrow to go back · Send when ready';
/**
 * Shown when the draft can go no further — allowance spent, or the last step was
 * terminal (§ *Terminal steps*). Offering "click to extend" with an empty
 * clickable set is the small kind of lie this packet exists to remove: the player
 * hunts for a ray that is not there and concludes the rays are broken.
 */
export const ROUTE_HINT_FINISHED =
  'This run can go no further · click a walked arrow to go back · Send when ready';

/** The arrows a list of drafted moves walks, in order. */
export const draftExits = (draft: readonly Move[]): readonly ArrowId[] =>
  draft.filter((move): move is StepMove => move.kind === 'step').map((move) => move.exit);

/** The moves that walk `steps` from `tip`, all at one carry. */
export const runMoves = (
  tip: ArrowId,
  steps: readonly ArrowId[],
  carry: number,
): readonly Move[] => {
  const moves: Move[] = [];
  let at = tip;
  for (const exit of steps) {
    moves.push(step(at, exit, carry));
    at = exit;
  }
  return moves;
};

/**
 * Arrows the draft already walks, plus the source.
 *
 * A run ends rather than re-entering one of these, so a ray cannot loop on a
 * board with a short cycle, and the source is never offered as a destination —
 * clicking it deselects or pops (P11's idiom, unchanged).
 */
export const walkedArrows = (inputs: RouteInputs): ReadonlySet<ArrowId> =>
  new Set<ArrowId>([inputs.from, ...draftExits(inputs.draft)]);

/** `MAX_DEPTH` less the draft length. A bound on the search, never an authority. */
export const searchBound = (inputs: RouteInputs): number => {
  if (inputs.carry < 1 || !Number.isInteger(inputs.carry)) return 0;
  // `speed(carry)` can only ever *narrow* the window: a run carries the whole
  // carry, so no group on it is bigger than that. The engine still refuses every
  // hop past the allowance actually left.
  return Math.max(0, Math.min(MAX_DEPTH - inputs.draft.length, speed(inputs.carry)));
};

const headsOn = (state: GameState, arrow: ArrowId): number =>
  state.groups.get(arrow)?.heads ?? 0;

const exitAt = (
  geometry: GeometryPort,
  arrow: ArrowId,
  slot: RaySlot,
): ArrowId | undefined => geometry.outArrows(geometry.target(arrow))[slot];

/** The state after one hop, or `undefined` when the engine refuses it. */
const tryHop = (
  inputs: RouteInputs,
  state: GameState,
  move: StepMove,
): GameState | undefined => {
  try {
    return inputs.rules.apply(state, move);
  } catch {
    return undefined;
  }
};

/** A step, or `undefined` when it is not even a well-formed move. */
const hopMove = (at: ArrowId, exit: ArrowId, carry: number): StepMove | undefined => {
  if (at === exit || carry < 1 || !Number.isInteger(carry)) return undefined;
  return step(at, exit, carry);
};

/**
 * Did this accepted hop change the board beyond what an un-applied draft can show?
 *
 * Three do, and each **ends the draft**, not merely the run — at a terminal tip
 * the clickable set is empty and only Send or a pop remain:
 *
 * - **merge** — `before` held a group of the active player on `exit` (§3)
 * - **closure** — `after.territory` grew across the hop (§7)
 * - **combat** — head counts changed on `exit` or on `move.from` (§6.2)
 *
 * Detected by comparing the two scratch states, never by reading engine
 * internals. The closure case cannot come from `try apply … else stop`: the
 * engine *accepts* the hop after a closure lands, so this is the feature's own
 * rule.
 *
 * The combat test is *conservation* across the two arrows the hop touches, not
 * "the counts differ": every hop moves heads off `from` and onto `exit`, so a
 * plain difference would call every step terminal. Heads going missing is what
 * only combat does (§6.2's 1:1 exchange).
 */
export const isTerminalStep = (
  before: GameState,
  after: GameState,
  move: StepMove,
): boolean => {
  const standing = before.groups.get(move.exit);
  if (standing !== undefined && standing.owner === before.activePlayer) return true;
  if (after.territory.size > before.territory.size) return true;
  const was = headsOn(before, move.from) + headsOn(before, move.exit);
  const now = headsOn(after, move.from) + headsOn(after, move.exit);
  return now !== was;
};

/** One arrow of a ray, with the scratch state the run stands in after it. */
interface RayHop {
  readonly arrow: ArrowId;
  /** Exits from the tip to here, in order. */
  readonly steps: readonly ArrowId[];
  readonly state: GameState;
  readonly terminal: boolean;
}

const rayHops = (inputs: RouteInputs, slot: RaySlot): readonly RayHop[] => {
  if (inputs.terminal === true) return [];
  const bound = searchBound(inputs);
  const blocked = new Set<ArrowId>(walkedArrows(inputs));
  const hops: RayHop[] = [];
  let at = inputs.tip;
  let state = inputs.state;
  let steps: readonly ArrowId[] = [];
  for (let m = 0; m < bound; m += 1) {
    const exit = exitAt(inputs.geometry, at, slot);
    if (exit === undefined || blocked.has(exit)) break;
    const move = hopMove(at, exit, inputs.carry);
    if (move === undefined) break;
    const next = tryHop(inputs, state, move);
    if (next === undefined) break;
    steps = [...steps, exit];
    const terminal = isTerminalStep(state, next, move);
    hops.push({ arrow: exit, steps, state: next, terminal });
    if (terminal) break;
    blocked.add(exit);
    at = exit;
    state = next;
  }
  return hops;
};

/**
 * The arrows reachable from the tip through one slot, in order, truncated.
 *
 * Stops at the first hop the engine **refuses** — enemy territory without
 * territory-grade protection (§6.3), a P28 refused self-convert exit, an attack
 * the stay-behind rule forbids, a revisit, allowance running out — and at the
 * first hop it **accepts terminally**, see {@link isTerminalStep}.
 *
 * §6.2's stay-behind (`count <= heads - 1`, §11 item 38) is why an enemy-held
 * arrow is never reached mid-run: a run moves the whole carry, so after the first
 * hop `count = heads` at the tip and the attack is refused. A ray therefore ends
 * *before* an enemy-held arrow at distance >= 2, and an adjacent one is offered
 * only while `carry <= tipHeads - 1`.
 */
export const rayArrows = (inputs: RouteInputs, slot: RaySlot): readonly ArrowId[] =>
  rayHops(inputs, slot).map((hop) => hop.arrow);

/** A clickable arrow, plus the scratch state a click on it would leave behind. */
interface WalkedOption {
  readonly option: RouteOption;
  readonly state: GameState;
  readonly terminal: boolean;
}

const turnOptions = (
  inputs: RouteInputs,
  slot: RaySlot,
  hop: RayHop,
  blocked: ReadonlySet<ArrowId>,
): readonly WalkedOption[] => {
  const out: WalkedOption[] = [];
  for (const turnSlot of RAY_SLOTS) {
    if (turnSlot === slot) continue;
    const exit = exitAt(inputs.geometry, hop.arrow, turnSlot);
    if (exit === undefined || blocked.has(exit) || hop.steps.includes(exit)) continue;
    const move = hopMove(hop.arrow, exit, inputs.carry);
    if (move === undefined) continue;
    const next = tryHop(inputs, hop.state, move);
    if (next === undefined) continue;
    out.push({
      option: { arrow: exit, kind: 'turn', slot, steps: [...hop.steps, exit] },
      state: next,
      terminal: isTerminalStep(hop.state, next, move),
    });
  }
  return out;
};

/**
 * Every offer from the tip: the three rays, then the turns off them.
 *
 * Rays first so that where a ray arrow and a turn arrow land on the same arrow at
 * the same distance — which an abstract fixture board allows and the tiling's
 * linear lattice does not — the ray keeps the entry.
 */
const routeOptions = (inputs: RouteInputs): readonly WalkedOption[] => {
  const rays = RAY_SLOTS.map((slot) => rayHops(inputs, slot));
  const blocked = walkedArrows(inputs);
  const out: WalkedOption[] = [];
  for (const slot of RAY_SLOTS) {
    for (const hop of rays[slot] ?? []) {
      out.push({
        option: { arrow: hop.arrow, kind: 'ray', slot, steps: hop.steps },
        state: hop.state,
        terminal: hop.terminal,
      });
    }
  }
  for (const slot of RAY_SLOTS) {
    for (const hop of rays[slot] ?? []) {
      // A turn off a terminal ray arrow would draft *past* a merge, a closure or
      // resolved combat — the board a later leg would be drawn against is gone.
      if (hop.terminal) continue;
      out.push(...turnOptions(inputs, slot, hop, blocked));
    }
  }
  return out;
};

/** Shorter routes win, and a tie keeps the entry offered first (rays before turns). */
const keepShortest = (walked: readonly WalkedOption[]): Map<ArrowId, WalkedOption> => {
  const best = new Map<ArrowId, WalkedOption>();
  for (const item of walked) {
    const seen = best.get(item.option.arrow);
    if (seen !== undefined && seen.option.steps.length <= item.option.steps.length) continue;
    best.set(item.option.arrow, item);
  }
  return best;
};

const optionsOf = (best: ReadonlyMap<ArrowId, WalkedOption>): ClickableSet => {
  const clickable = new Map<ArrowId, RouteOption>();
  for (const [arrow, item] of best) clickable.set(arrow, item.option);
  return clickable;
};

/**
 * Ray arrows, plus the two turn arrows off every ray arrow.
 *
 * Ray-before-turn: a turn arrow exists only if its whole ray prefix is walkable,
 * and an arrow already keyed at a shorter distance keeps that shorter entry.
 *
 * **Empty at a terminal tip** — a tip the draft reached by merging, closing or
 * resolving combat offers Send or a pop and nothing else.
 */
export const clickableSet = (inputs: RouteInputs): ClickableSet =>
  inputs.terminal === true ? new Map() : optionsOf(keepShortest(routeOptions(inputs)));

/**
 * Carries that **arrive** — measured by simulation, as `reach.ts` measures
 * `minCount` / `maxCount`. Offering a carry that cannot move is the fastest way
 * to make a correct rule look broken.
 *
 * The carry is also how an attack is armed: §6.2's stay-behind means an adjacent
 * enemy arrow joins the clickable set only while `carry <= tipHeads - 1`.
 */
export const offerableCarries = (inputs: RouteInputs): readonly number[] => {
  if (inputs.terminal === true) return [];
  const exits = inputs.geometry.outArrows(inputs.geometry.target(inputs.tip));
  const out: number[] = [];
  for (let carry = 1; carry <= inputs.tipHeads; carry += 1) {
    const moves = exits
      .map((exit) => hopMove(inputs.tip, exit, carry))
      .filter((move): move is StepMove => move !== undefined);
    if (moves.some((move) => tryHop(inputs, inputs.state, move) !== undefined)) out.push(carry);
  }
  return out;
};

/**
 * Everything the carry can reach that no louder tier already claims.
 *
 * Present so a smaller *clickable* set never reads as a smaller *reach*: the rays
 * shrink when heads stay behind, and without this the player would read that as
 * the stack having lost its legs.
 */
const reachWashOf = (
  inputs: RouteInputs,
  clickable: ClickableSet,
): ReadonlySet<ArrowId> => {
  const wash = new Set<ArrowId>();
  if (inputs.terminal === true || inputs.carry < 1) return wash;
  const walked = walkedArrows(inputs);
  const reach = reachFrom(inputs.geometry, inputs.rules, inputs.state, inputs.tip);
  for (const [arrow, entry] of reach) {
    if (!entry.plans.has(inputs.carry)) continue;
    if (arrow === inputs.tip || clickable.has(arrow) || walked.has(arrow)) continue;
    wash.add(arrow);
  }
  return wash;
};

/** The inputs a click on `item` would leave behind — the shape a hover previews. */
const nextInputs = (inputs: RouteInputs, item: WalkedOption): RouteInputs => {
  const heads = headsOn(item.state, item.option.arrow);
  return {
    geometry: inputs.geometry,
    rules: inputs.rules,
    state: item.state,
    from: inputs.from,
    tip: item.option.arrow,
    draft: [...inputs.draft, ...runMoves(inputs.tip, item.option.steps, inputs.carry)],
    // The preview's carry is what stands on the new tip. On any hop the draft can
    // continue from, that *is* the carry — the whole carry arrives. Where the two
    // differ the hop was terminal, and then the offer is empty either way, so this
    // never disagrees with the extend `input/modes.ts` would actually make.
    carry: heads,
    tipHeads: heads,
    terminal: item.terminal,
  };
};

/** Build the whole offer once. Hover is then a lookup into `previews`. */
export const buildRouteOffer = (inputs: RouteInputs): RouteOffer => {
  const best: ReadonlyMap<ArrowId, WalkedOption> =
    inputs.terminal === true ? new Map() : keepShortest(routeOptions(inputs));
  const clickable = optionsOf(best);
  const previews = new Map<ArrowId, ClickableSet>();
  for (const [arrow, item] of best) previews.set(arrow, clickableSet(nextInputs(inputs, item)));
  return {
    tip: inputs.tip,
    carry: inputs.carry,
    rays: RAY_SLOTS.map((slot) => rayArrows(inputs, slot)),
    clickable,
    carries: offerableCarries(inputs),
    reachWash: reachWashOf(inputs, clickable),
    previews,
  };
};

/** The locked HUD line for a route phase: empty draft or drafted. */
export const routeHint = (phase: InputPhase): string | undefined => {
  if (phase.kind !== 'route') return undefined;
  if (phase.draft.length === 0) return ROUTE_HINT_EMPTY;
  return phase.offer.clickable.size === 0 ? ROUTE_HINT_FINISHED : ROUTE_HINT_DRAFTED;
};

const emptyPaint = (): RoutePaint => ({
  reachWash: new Set(),
  rayArrows: new Set(),
  turnArrows: new Set(),
  draftArrows: [],
  hoverPreview: new Set(),
});

const previewFor = (
  offer: RouteOffer,
  pointer: PointerKind,
  hoverArrow: ArrowId | undefined,
): ReadonlySet<ArrowId> => {
  if (pointer !== 'fine' || hoverArrow === undefined) return new Set();
  const preview = offer.previews.get(hoverArrow);
  return preview === undefined ? new Set() : new Set(preview.keys());
};

/**
 * Paint for the route phase, and nothing at all for any other phase.
 *
 * A coarse pointer gets no hover preview: every clickable arrow is unambiguous,
 * so there is nothing a preview must disclose.
 *
 * Costs **no** `rules.apply` call: everything is a lookup into the offer the
 * phase already carries, because hover lag is what would make this model feel
 * broken.
 */
export const routePaint = (opts: {
  readonly phase: InputPhase;
  readonly hoverArrow?: ArrowId;
  readonly pointer: PointerKind;
}): RoutePaint => {
  const { phase, pointer } = opts;
  if (phase.kind !== 'route') return emptyPaint();
  const rays = new Set<ArrowId>();
  const turns = new Set<ArrowId>();
  for (const [arrow, option] of phase.offer.clickable) {
    if (option.kind === 'ray') rays.add(arrow);
    else turns.add(arrow);
  }
  return {
    reachWash: phase.offer.reachWash,
    rayArrows: rays,
    turnArrows: turns,
    draftArrows: draftExits(phase.draft),
    hoverPreview: previewFor(phase.offer, pointer, opts.hoverArrow),
    tip: phase.tip,
  };
};
