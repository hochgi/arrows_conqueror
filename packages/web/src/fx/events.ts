/**
 * Resolved gameplay events — a *reading* of one `apply`, for the presentation layer.
 *
 * The rules engine stays the only thing that decides anything. This module diffs the
 * state it produced (`before` → `after`, plus the `Move` that caused it) and names
 * what changed, so a renderer can say `showEvent(trailCut)` instead of trying to
 * infer a cut from arbitrary state differences at paint time.
 *
 * Two lines that are easy to cross and must not be:
 *
 *   - **Nothing here re-decides a rule.** There is no closure test, no even-odd
 *     fill, no chord test, no combat table. Every field is read out of the diff.
 *     The step's `exit` is used *only* to anchor an effect in space — never to
 *     decide whether something happened.
 *   - **Nothing here is authoritative.** If an event is dropped, mis-ordered, or
 *     never rendered, the board is still correct, because the board renders
 *     `after` and the events only decorate it.
 *
 * Pure and deterministic: no clock, no randomness, and every arrow set leaves here
 * sorted by id, because a `Set` iteration order feeding a staggered animation is
 * exactly the kind of ordering bug ADR 0001 warns about.
 */

import type { ArrowId, GameState, Move, PlayerId } from '@conquarrow/contracts';

export type GameEvent =
  /** A portion walked one arrow onto empty or own-but-unoccupied ground. Tier 3. */
  | {
      readonly kind: 'moved';
      readonly player: PlayerId;
      readonly from: ArrowId;
      readonly to: ArrowId;
      readonly heads: number;
    }
  /** Arrows that joined the mover's open trail — the exposed part of an expansion. */
  | { readonly kind: 'trailLaid'; readonly player: PlayerId; readonly arrows: readonly ArrowId[] }
  /** The stack divided: `moved` went on, `stayed` did not. Tier 2. */
  | {
      readonly kind: 'stackSplit';
      readonly player: PlayerId;
      readonly from: ArrowId;
      readonly to: ArrowId;
      readonly moved: number;
      readonly stayed: number;
    }
  /** Heads the player chose to leave behind (§5 sentry). Always paired with a split. */
  | {
      readonly kind: 'sentryLeft';
      readonly player: PlayerId;
      readonly arrow: ArrowId;
      readonly heads: number;
    }
  /** Arriving heads joined heads already standing there. Convergence, not conflict. */
  | {
      readonly kind: 'stackMerged';
      readonly player: PlayerId;
      readonly from: ArrowId;
      readonly to: ArrowId;
      readonly arriving: number;
      readonly existing: number;
      readonly total: number;
    }
  /** Contact combat on one arrow (§6.2). `holder` is whoever is left standing. */
  | {
      readonly kind: 'combat';
      readonly arrow: ArrowId;
      readonly attacker: PlayerId;
      readonly defender: PlayerId;
      readonly attackerSent: number;
      readonly defenderBefore: number;
      readonly attackerLost: number;
      readonly defenderLost: number;
      readonly holder: PlayerId | undefined;
    }
  /**
   * The loop closed. `boundary` is the trail that became territory — the actual
   * geometry of the loop, not a bounding box — and `claimed` is everything the
   * closure took.
   */
  | {
      readonly kind: 'enclosureClosed';
      readonly player: PlayerId;
      readonly closingArrow: ArrowId | undefined;
      readonly boundary: readonly ArrowId[];
      readonly claimed: readonly ArrowId[];
    }
  /** Ground that changed to this player. `fromArrow` anchors the fill in space. */
  | {
      readonly kind: 'territoryCaptured';
      readonly player: PlayerId;
      readonly arrows: readonly ArrowId[];
      readonly fromArrow: ArrowId | undefined;
      readonly takenFrom: readonly PlayerId[];
    }
  /** Ground this player no longer holds — a separate consequence from losing heads. */
  | {
      readonly kind: 'territoryLost';
      readonly player: PlayerId;
      readonly to: PlayerId | undefined;
      readonly arrows: readonly ArrowId[];
      readonly atArrow: ArrowId | undefined;
    }
  /** Trail destroyed by someone crossing it (§6.1). Severing, not damage. */
  | {
      readonly kind: 'trailCut';
      readonly victim: PlayerId;
      readonly attacker: PlayerId;
      readonly cutArrow: ArrowId | undefined;
      readonly arrows: readonly ArrowId[];
    }
  /** Encircled heads changed owner without moving (§6.3). */
  | {
      readonly kind: 'unitsConverted';
      readonly arrow: ArrowId;
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly heads: number;
    }
  /** Heads that appeared where no move put them — a spawner share paid out (§7). */
  | {
      readonly kind: 'unitsProduced';
      readonly player: PlayerId;
      readonly arrow: ArrowId;
      readonly amount: number;
    }
  | { readonly kind: 'turnPassed'; readonly from: PlayerId; readonly to: PlayerId }
  | { readonly kind: 'matchWon'; readonly player: PlayerId };

export type GameEventKind = GameEvent['kind'];

/** One applied move and the states either side of it. */
export interface AppliedStep {
  readonly before: GameState;
  readonly after: GameState;
  readonly move: Move;
}

const byId = (left: ArrowId, right: ArrowId): number => {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

const byPlayer = (left: PlayerId, right: PlayerId): number => {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

const sortedArrows = (arrows: Iterable<ArrowId>): readonly ArrowId[] =>
  [...arrows].toSorted(byId);

/** Players named by either state, in id order. */
const allPlayers = (before: GameState, after: GameState): readonly PlayerId[] => {
  const set = new Set<PlayerId>(before.players);
  for (const p of after.players) set.add(p);
  for (const p of before.trails.keys()) set.add(p);
  for (const p of after.trails.keys()) set.add(p);
  for (const owner of before.territory.values()) set.add(owner);
  for (const owner of after.territory.values()) set.add(owner);
  return [...set].toSorted(byPlayer);
};

/** Arrows this player holds as territory in `after` but did not in `before`. */
const territoryGained = (
  before: GameState,
  after: GameState,
  player: PlayerId,
): readonly ArrowId[] => {
  const gained: ArrowId[] = [];
  for (const [arrow, owner] of after.territory) {
    if (owner === player && before.territory.get(arrow) !== player) gained.push(arrow);
  }
  return sortedArrows(gained);
};

/** Arrows this player held and no longer does, with whoever holds them now. */
const territoryLost = (
  before: GameState,
  after: GameState,
  player: PlayerId,
): { readonly arrows: readonly ArrowId[]; readonly to: PlayerId | undefined } => {
  const lost: ArrowId[] = [];
  const takers = new Set<PlayerId>();
  for (const [arrow, owner] of before.territory) {
    if (owner !== player) continue;
    const now = after.territory.get(arrow);
    if (now === player) continue;
    lost.push(arrow);
    if (now !== undefined) takers.add(now);
  }
  const sole = takers.size === 1 ? [...takers][0] : undefined;
  return { arrows: sortedArrows(lost), to: sole };
};

const trailDropped = (
  before: GameState,
  after: GameState,
  player: PlayerId,
): readonly ArrowId[] => {
  const held = before.trails.get(player);
  if (held === undefined) return [];
  const now = after.trails.get(player);
  const dropped: ArrowId[] = [];
  for (const arrow of held) if (now?.has(arrow) !== true) dropped.push(arrow);
  return sortedArrows(dropped);
};

const trailAdded = (
  before: GameState,
  after: GameState,
  player: PlayerId,
): readonly ArrowId[] => {
  const now = after.trails.get(player);
  if (now === undefined) return [];
  const held = before.trails.get(player);
  const added: ArrowId[] = [];
  for (const arrow of now) if (held?.has(arrow) !== true) added.push(arrow);
  return sortedArrows(added);
};

/** The arrow an effect should radiate from: where the move landed. */
const anchorOf = (move: Move): ArrowId | undefined =>
  move.kind === 'step' ? move.exit : undefined;

// ── what the move itself did to the stacks it named ───────────────────────────

/** Split / sentry / merge / combat / plain advance, all read off `from` and `exit`. */
const stackEvents = (step: AppliedStep): readonly GameEvent[] => {
  const { before, after, move } = step;
  if (move.kind !== 'step') return [];
  const source = before.groups.get(move.from);
  if (source === undefined) return [];
  const player = source.owner;
  const out: GameEvent[] = [];

  const stayed = source.heads - move.count;
  if (stayed > 0) {
    out.push({
      kind: 'stackSplit',
      player,
      from: move.from,
      to: move.exit,
      moved: move.count,
      stayed,
    });
    out.push({ kind: 'sentryLeft', player, arrow: move.from, heads: stayed });
  }

  const target = before.groups.get(move.exit);
  const landed = after.groups.get(move.exit);
  if (target === undefined) {
    out.push({ kind: 'moved', player, from: move.from, to: move.exit, heads: move.count });
  } else if (target.owner === player) {
    out.push({
      kind: 'stackMerged',
      player,
      from: move.from,
      to: move.exit,
      arriving: move.count,
      existing: target.heads,
      total: landed?.heads ?? move.count + target.heads,
    });
  } else {
    const attackerLeft = landed?.owner === player ? landed.heads : 0;
    const defenderLeft = landed?.owner === target.owner ? landed.heads : 0;
    out.push({
      kind: 'combat',
      arrow: move.exit,
      attacker: player,
      defender: target.owner,
      attackerSent: move.count,
      defenderBefore: target.heads,
      attackerLost: move.count - attackerLeft,
      defenderLost: target.heads - defenderLeft,
      holder: landed?.owner,
    });
  }
  return out;
};

// ── what the move did to ground and trails ───────────────────────────────────

/**
 * Closure, capture, loss and cuts.
 *
 * The one judgement in this module: a trail arrow the mover lost *while gaining it
 * as territory* is the loop being promoted to ground, not a cut. Every other trail
 * arrow that vanished is destruction, and the mover is the one who caused it —
 * which is true whether the victim is an opponent or the mover themself.
 */
const groundEvents = (step: AppliedStep, mover: PlayerId): readonly GameEvent[] => {
  const { before, after, move } = step;
  const anchor = anchorOf(move);
  const out: GameEvent[] = [];
  const cuts: GameEvent[] = [];
  const captures: GameEvent[] = [];
  const losses: GameEvent[] = [];

  for (const player of allPlayers(before, after)) {
    const gained = territoryGained(before, after, player);
    const dropped = trailDropped(before, after, player);
    const claimedSet = new Set(gained.map(String));
    const severed = dropped.filter((arrow) => !claimedSet.has(String(arrow)));

    if (gained.length > 0) {
      const boundary = dropped.filter((arrow) => claimedSet.has(String(arrow)));
      const takers = new Set<PlayerId>();
      for (const arrow of gained) {
        const prev = before.territory.get(arrow);
        if (prev !== undefined) takers.add(prev);
      }
      captures.push({
        kind: 'enclosureClosed',
        player,
        closingArrow: anchor,
        boundary,
        claimed: gained,
      });
      captures.push({
        kind: 'territoryCaptured',
        player,
        arrows: gained,
        fromArrow: anchor,
        takenFrom: [...takers].toSorted(byPlayer),
      });
    }

    if (severed.length > 0) {
      cuts.push({
        kind: 'trailCut',
        victim: player,
        attacker: mover,
        cutArrow: anchor,
        arrows: severed,
      });
    }

    const lost = territoryLost(before, after, player);
    if (lost.arrows.length > 0) {
      losses.push({
        kind: 'territoryLost',
        player,
        to: lost.to,
        arrows: lost.arrows,
        atArrow: anchor,
      });
    }
  }

  // Causal order: the impact, then what it destroyed, then what it claimed.
  out.push(...cuts, ...captures, ...losses);
  return out;
};

// ── what changed without any move naming it ──────────────────────────────────

/**
 * Conversions (§6.3) and spawner births (§7): the group changes on arrows the move
 * did not name. Both are "this happened *because of* what you just did", and both
 * are invisible without a cue, since neither has a source arrow to move from.
 */
const offMoveEvents = (step: AppliedStep): readonly GameEvent[] => {
  const { before, after, move } = step;
  const named = new Set<string>();
  if (move.kind === 'step') {
    named.add(String(move.from));
    named.add(String(move.exit));
  }
  const arrows = new Set<ArrowId>([...before.groups.keys(), ...after.groups.keys()]);
  const conversions: GameEvent[] = [];
  const births: GameEvent[] = [];

  for (const arrow of sortedArrows(arrows)) {
    if (named.has(String(arrow))) continue;
    const was = before.groups.get(arrow);
    const now = after.groups.get(arrow);
    if (now === undefined) continue;
    if (was === undefined) {
      births.push({ kind: 'unitsProduced', player: now.owner, arrow, amount: now.heads });
      continue;
    }
    if (was.owner !== now.owner) {
      conversions.push({
        kind: 'unitsConverted',
        arrow,
        from: was.owner,
        to: now.owner,
        heads: now.heads,
      });
      continue;
    }
    if (now.heads > was.heads) {
      births.push({
        kind: 'unitsProduced',
        player: now.owner,
        arrow,
        amount: now.heads - was.heads,
      });
    }
  }
  return [...conversions, ...births];
};

/**
 * Name everything one applied move changed, in causal order.
 *
 * The order is the deliverable as much as the contents: a consumer that renders
 * this list front-to-back with increasing delays shows the player *the cause
 * before the consequence*, which is the whole ask.
 */
export const resolveEvents = (step: AppliedStep): readonly GameEvent[] => {
  const { before, after } = step;
  const mover = before.activePlayer;
  const out: GameEvent[] = [];

  out.push(...stackEvents(step));

  const laid = trailAdded(before, after, mover);
  if (laid.length > 0) out.push({ kind: 'trailLaid', player: mover, arrows: laid });

  out.push(...groundEvents(step, mover));
  out.push(...offMoveEvents(step));

  if (after.activePlayer !== before.activePlayer) {
    out.push({ kind: 'turnPassed', from: before.activePlayer, to: after.activePlayer });
  }
  if (after.winner !== undefined && before.winner === undefined) {
    out.push({ kind: 'matchWon', player: after.winner });
  }
  return out;
};

/**
 * Resolve a whole batch — a multi-step trip, or a bot's turn applied at once.
 *
 * Per step rather than end-to-end on purpose. A three-step trip that splits on
 * step one and closes on step three has two distinguishable causes, and a single
 * before/after diff would collapse them into one indistinguishable blob.
 */
export const resolveBatch = (steps: readonly AppliedStep[]): readonly GameEvent[] => {
  const out: GameEvent[] = [];
  for (const step of steps) out.push(...resolveEvents(step));
  return out;
};
