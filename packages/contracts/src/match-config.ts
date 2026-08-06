/**
 * Match setup tuning — playtest-first defaults (P09 / §7 / §8 / §9).
 *
 * All numbers are setup data: the rules core never branches on them; it only
 * reads `dominationN` from state and opaque spawner forces.
 */

/** PoC defaults — keep editable for experimentation. */
export interface MatchConfig {
  /** Domination hold window in full rounds (§9). Default 5. */
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
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  dominationN: 5,
  R: 7,
  homeOffset: 5,
  playerCount: 2,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/**
 * Force at graph distance *r* from the origin: `1 / 3^r` for *r* in `1..R`
 * (P09 PoC gradient). Clamps *r* into that range.
 */
export const forceAtRadius = (r: number, R: number): { num: number; den: number } => {
  const clamped = Math.min(R, Math.max(1, Math.trunc(r)));
  let den = 1;
  for (let i = 0; i < clamped; i += 1) den *= 3;
  return { num: 1, den };
};
