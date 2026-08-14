import type { GameState, Move } from '@conquarrow/contracts';
import { chooseMove } from '../../web/src/opponent';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';

const geometry = makeTiling();
const rules = makeRules(geometry);

/** Production chooser — Pages `chooseMove`, not a weaker stand-in. */
export const pagesHeuristic = (state: GameState): Move =>
  chooseMove(geometry, rules, state, state.activePlayer);
