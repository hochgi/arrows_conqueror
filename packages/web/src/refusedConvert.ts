/**
 * Refused self-convert targets — grain outs that would convert the selected stack.
 *
 * Packet P28. Observable via `legalMoves` / `apply` / `anchorGrade`; this helper
 * only names those exits for the board (wash, cursor, tooltip). The predicate
 * is the SPEC §6.3 / P28 D3 formula, duplicated here because D10 forbids a port
 * method — do not import rules-core internals.
 */

import type { ArrowId, GameState, GeometryPort, PlayerId, RulesPort } from '@conquarrow/contracts';

export const CONVERT_REFUSED_COPY =
  'Would convert. This is their territory, and you have no trail home.';

/** Same formula as `isSelfConvertStep` in rules-core. Protection is read off `from`. */
const isSelfConvertStep = (
  state: GameState,
  from: ArrowId,
  exit: ArrowId,
  mover: PlayerId,
  rules: RulesPort,
): boolean => {
  const land = state.territory.get(exit);
  if (land === undefined || land === mover) return false;
  if (state.territory.get(from) === mover) return false;
  const trail = state.trails.get(mover);
  if (trail !== undefined && trail.has(from) && rules.anchorGrade(state, from, mover) === 'territory') {
    return false;
  }
  return true;
};

export const refusedConvertExits = (
  state: GameState,
  geometry: GeometryPort,
  rules: RulesPort,
  from: ArrowId,
): ReadonlySet<ArrowId> => {
  const mover = state.groups.get(from)?.owner;
  if (mover === undefined) return new Set();
  const refused = new Set<ArrowId>();
  for (const exit of geometry.outArrows(geometry.target(from))) {
    if (isSelfConvertStep(state, from, exit, mover, rules)) refused.add(exit);
  }
  return refused;
};

const hoveringRefused = (
  state: GameState,
  geometry: GeometryPort,
  rules: RulesPort,
  selectedFrom: ArrowId | undefined,
  hover: ArrowId | undefined,
): boolean =>
  selectedFrom !== undefined &&
  hover !== undefined &&
  refusedConvertExits(state, geometry, rules, selectedFrom).has(hover);

export const convertTooltip = (
  state: GameState,
  geometry: GeometryPort,
  rules: RulesPort,
  selectedFrom: ArrowId | undefined,
  hover: ArrowId | undefined,
): string | undefined =>
  hoveringRefused(state, geometry, rules, selectedFrom, hover)
    ? CONVERT_REFUSED_COPY
    : undefined;

export const refusedCursor = (
  state: GameState,
  geometry: GeometryPort,
  rules: RulesPort,
  selectedFrom: ArrowId | undefined,
  hover: ArrowId | undefined,
): 'not-allowed' | undefined =>
  hoveringRefused(state, geometry, rules, selectedFrom, hover) ? 'not-allowed' : undefined;
