/**
 * Match setup tuning — playtest-first defaults (P09 / §7 / §8 / §9).
 *
 * All numbers are setup data: the rules core never branches on them; it only
 * reads `dominationN` (starvation threshold) from state and opaque spawner forces.
 */

/** PoC defaults — keep editable for experimentation. */
export interface MatchConfig {
  /** Starvation window in full rounds (§9) — zero shares for this long loses. Default 5. */
  readonly dominationN: number;
  /** Spawner cutoff radius in graph distance from the origin (§7). Default 7. */
  readonly R: number;
  /**
   * Graph distance of home corners from the origin. Default 5 — far enough that
   * the centre stays contested, inside *R*.
   */
  readonly homeOffset: number;
  /**
   * How many seats to place (2–8). Homes sit on a hexagon about the origin:
   * opposite corners (2), alternating corners (3), four corners leaving one
   * opposite pair free (4), all six corners (6), equal angular span otherwise.
   */
  readonly playerCount: number;
  /**
   * Seed for the deterministic thinning that realises {@link SpawnerBand.density}.
   * Changing it moves *which* vertices carry a spawner without changing how many;
   * it is a pure input to a hash, never a draw from an RNG (§7, ADR 0001).
   */
  readonly spawnerSeed: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  dominationN: 5,
  R: 7,
  homeOffset: 5,
  playerCount: 2,
  spawnerSeed: 1,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** One radial band of the spawner landscape (§7, *the radial gradient*). */
export interface SpawnerBand {
  /** Inclusive outer radius, in graph distance from the origin. */
  readonly upTo: number;
  /** Force of every spawner in the band, as an exact rational (§7). */
  readonly force: { readonly num: number; readonly den: number };
  /** Fraction of eligible vertices that carry one, as an exact rational. */
  readonly density: { readonly num: number; readonly den: number };
}

/**
 * The radial gradient, as authored bands.
 *
 * §7 asks for **bands rather than a smooth curve, deliberately**: a continuous *f*(*r*)
 * needs a rounding rule to land on a rational, and the coprime-denominator rhythm the
 * economy is built on depends on 1/9 against 1/12 rather than on 1/9 against 0.1083. So
 * the values here are exactly the three §7's force table names, and nothing between them.
 *
 * **This replaces P09's `1/3^r` placeholder, which overshot badly.** At *R* = 7 that
 * curve ran the rim at 1/2187 — one head per 2187 rounds per share, which is not slow
 * but *nothing* — against 1/3 at the centre, a 729:1 ratio. Whoever reached the middle
 * first had won, and every other spawner on the board was scenery. The ratio here is
 * **4:1**, which keeps §7's principle (*fast spawners belong where the fighting is*)
 * while leaving the outer bands worth holding.
 *
 * Density carries the rest of the gradient, and §7 says why it is the better lever:
 * force sets how fast one spawner pays, density sets how many arrows are **double-fed**,
 * which halves fill time again on top of it. §7's own sketch is **half** in the contested
 * disc and an eighth at the rim — *"at half density three quarters of centre arrows are
 * fed and a third of those are double-fed"*. An earlier PoC ran the centre at full density;
 * playtests showed one mid close snowballing into too many shares and too many stacks, so
 * the table below tracks that sketch more closely (half / third / sixth / twelfth).
 *
 * The centre is still *concentrated* via force 1/3, not by carpeting every pinwheel.
 */
export const SPAWNER_BANDS: readonly SpawnerBand[] = [
  { upTo: 1, force: { num: 1, den: 3 }, density: { num: 1, den: 2 } },
  { upTo: 3, force: { num: 1, den: 9 }, density: { num: 1, den: 3 } },
  { upTo: 5, force: { num: 1, den: 12 }, density: { num: 1, den: 6 } },
  { upTo: Number.POSITIVE_INFINITY, force: { num: 1, den: 12 }, density: { num: 1, den: 12 } },
];

/** The band a radius falls in, clamped into `[0, R]`. */
export const bandAtRadius = (r: number, R: number): SpawnerBand => {
  const cutoff = Math.max(0, Math.trunc(R));
  const clamped = Math.min(cutoff, Math.max(0, Math.trunc(r)));
  for (const band of SPAWNER_BANDS) if (clamped <= band.upTo) return band;
  const last = SPAWNER_BANDS[SPAWNER_BANDS.length - 1];
  if (last === undefined) throw new Error('setup: SPAWNER_BANDS is empty');
  return last;
};

/** Force at graph distance *r* from the origin (§7). See {@link SPAWNER_BANDS}. */
export const forceAtRadius = (r: number, R: number): { num: number; den: number } =>
  bandAtRadius(r, R).force;

/**
 * What fraction of eligible vertices at distance *r* carry a spawner (§7).
 *
 * Which ones is a pure hash of the vertex and `spawnerSeed` — see `makeMatch`. Density
 * is a *count* discipline, not a mechanic: no rule asks how many spawners there are.
 */
export const densityAtRadius = (r: number, R: number): { num: number; den: number } =>
  bandAtRadius(r, R).density;
