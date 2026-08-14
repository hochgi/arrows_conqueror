/**
 * Self-inflicted conversion is illegal — SPEC §6.3 / P28.
 *
 * A grain step onto another player's territory converts the mover unless they
 * are territory-grade protected from `from`. That step is omitted from
 * `legalMoves` and refused by `apply` before occupancy or combat. Opponent-
 * caused conversion (already-encircled groups) stays in `encirclement.ts`.
 *
 * Pure: a function of pictured state plus `anchorGrade`. No clock, no
 * randomness, no I/O, no vertex enumeration.
 */

import type { AnchorGrade, ArrowId, GameState, PlayerId } from '@conquarrow/contracts';

/** Stable `ContractViolation` message — tests lock this string. */
export const SELF_CONVERT_MESSAGE =
  'step onto enemy territory without a territory-grade trail would convert';

type GradeOf = (state: GameState, arrow: ArrowId, player: PlayerId) => AnchorGrade;

/**
 * Whether `step(from, exit, _)` by `mover` would convert them on this apply.
 *
 * Protection is read off `from` before the step (P28 D3). `anchorGrade` is
 * only asked when `from` is already on the mover's trail — the port throws
 * otherwise, and unmarked / home tiles are not a grade question.
 */
export const isSelfConvertStep = (
  state: GameState,
  from: ArrowId,
  exit: ArrowId,
  mover: PlayerId,
  gradeOf: GradeOf,
): boolean => {
  const land = state.territory.get(exit);
  if (land === undefined || land === mover) return false;
  if (state.territory.get(from) === mover) return false;
  const trail = state.trails.get(mover);
  if (trail !== undefined && trail.has(from) && gradeOf(state, from, mover) === 'territory') {
    return false;
  }
  return true;
};
