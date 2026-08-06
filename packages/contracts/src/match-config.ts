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
   * Lattice offset for homes along a reflected pair. Default 5 — far enough
   * from the origin that the centre stays contested, inside *R*.
   */
  readonly homeOffset: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  dominationN: 5,
  R: 7,
  homeOffset: 5,
};

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
