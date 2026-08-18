/**
 * One timing vocabulary for every gameplay effect.
 *
 * Presentation only — nothing here is read by the rules. The numbers exist in one
 * place so the board keeps a *consistent* language: a player learns that a short
 * localized flash means combat and a spatial fill means capture, and that lesson
 * only holds if every capture takes the same time as every other one.
 *
 * The upper bound is deliberate. The state transition has already happened by the
 * time any of this runs — an effect is drawn *around* a committed `apply`, never
 * in front of one — so a long effect never delays input. It would still be a lie
 * about how fast the game is, which is why the biggest sequence in the game
 * (enclosure → capture → production) fits inside {@link MAJOR_SEQUENCE_MS}.
 */

/**
 * Visual weight. Tier 1 is the handful of events that decide matches, tier 3 is
 * everything a player does dozens of times a turn and must never be celebrated.
 */
export type FxTier = 1 | 2 | 3;

/** How long one effect's own animation runs, once its offset has elapsed (ms). */
export const FX_MS = {
  /** Routine: the step itself, and the trail cell it leaves. */
  moved: 220,
  trailLaid: 200,
  /** Strategic: the stack changed shape. */
  split: 300,
  merge: 300,
  sentry: 280,
  produced: 320,
  converted: 360,
  /** Major: the loop closed, ground changed hands, a trail was severed. */
  closed: 300,
  captured: 400,
  captureFresh: 700,
  lost: 420,
  cut: 420,
  combat: 320,
  /** A fight that wiped a stack of three or more reads heavier than a 1:1 trade. */
  combatHeavy: 440,
  /** Feedback, not an event: a refused click and the turn handover. */
  refused: 320,
  turn: 260,
} as const;

/**
 * Causal offsets — when each link of a chain *starts*, relative to the move.
 *
 * This is the whole point of the layer. A capture that fills at the same instant
 * the loop pulses reads as one undifferentiated flash; staggered, it reads as
 * "the loop closed, *therefore* this ground is mine, *therefore* these heads
 * appeared". The offsets are what makes the causal order visible.
 */
export const FX_OFFSET_MS = {
  /** The closing segment is the cause; it goes first, at zero. */
  closing: 0,
  loop: 40,
  captureFill: 220,
  captureFresh: 500,
  produced: 560,
  /** A cut's consequence trails the impact that caused it. */
  cut: 90,
  /** Losing ground reads as the other half of the winner's capture. */
  lost: 260,
  converted: 300,
} as const;

/** Per-cell delay as an effect walks outward from its spatial origin (ms). */
export const FX_STAGGER_MS = {
  loop: 22,
  captureFill: 26,
  cut: 38,
  produced: 90,
  lost: 26,
} as const;

/**
 * Ceiling on accumulated stagger. A 200-tile capture must not animate for five
 * seconds just because it is large — past this point the far cells all land
 * together and the effect still reads as "outward from the closure".
 */
export const FX_STAGGER_CAP_MS = 260;

/** Budget for the longest chain in the game (enclosure → capture → production). */
export const MAJOR_SEQUENCE_MS = 700;

const TIERS: Readonly<Record<string, FxTier>> = {
  loopPulse: 1,
  captureFill: 1,
  captureFresh: 1,
  lossRetract: 1,
  evaporate: 1,
  cutSnap: 1,
  combat: 1,
  divergence: 2,
  convergence: 2,
  sentry: 2,
  emergence: 2,
  conversion: 2,
  trailLaid: 3,
  advance: 3,
  refusal: 3,
  turnHandover: 3,
};

/** Visual weight of one overlay kind. Unknown kinds are routine, never major. */
export const tierOf = (kind: string): FxTier => TIERS[kind] ?? 3;
