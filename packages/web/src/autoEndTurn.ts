/**
 * Hot-seat QoL: when the active player has no legal step, apply `endTurn`.
 *
 * The rules core still requires an explicit `endTurn` (P04) — this is the adapter
 * sending it, so replays stay honest. Skips are not required first: stuck branch
 * tolls with leftover allowance are the common "only skip left" case.
 */

import { endTurn } from '@arrows/contracts';
import type { GameState, RulesPort } from '@arrows/contracts';

export const hasLegalStep = (rules: RulesPort, state: GameState): boolean =>
  rules.legalMoves(state).some((m) => m.kind === 'step');

/**
 * Apply `endTurn` until someone can step, or every player has been passed once
 * (mutual soft-lock). Always returns a new state when it passes; same reference
 * when nothing to do.
 */
export const passIfExhausted = (rules: RulesPort, state: GameState): GameState => {
  if (state.winner !== undefined || hasLegalStep(rules, state)) return state;
  let current: GameState = state;
  const passed = new Set<string>();
  while (current.winner === undefined && !hasLegalStep(rules, current)) {
    const who = String(current.activePlayer);
    if (passed.has(who)) return current;
    passed.add(who);
    current = rules.apply(current, endTurn());
  }
  return current;
};
