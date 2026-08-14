/**
 * Adapter conversation replay: signed-in + `#/g/…` → GET opening → POST
 * `endTurn` If-Match `"0"` → GET. Board equals the second GET (not a local apply).
 *
 * Does not re-record rules-core goldens.
 *
 * @see docs/spec/online-web/online-web.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn } from '@conquarrow/contracts';
import {
  ALICE,
  GAME_ONE,
  GROUP_HASH,
  apiCalls,
  boardAt,
  gameHash,
  getGameScript,
  ifMatchOf,
  makePagesHarness,
  openingBoard,
  parseJson,
  postMoveScript,
  quotedVersion,
} from './online-web.support';

describe('an online Pages conversation replay reproduces GET state', () => {
  it('signed-in #/g/… → GET opening → POST endTurn If-Match "0" → GET equals the second GET', async () => {
    const opening = openingBoard('replay-opening');
    const afterGet = boardAt(1, { activePlayer: 'B', tag: 'replay-second-get' });
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [
        getGameScript(opening),
        postMoveScript(200, { version: 1, groupHash: GROUP_HASH, gameNumber: GAME_ONE }),
        getGameScript(afterGet),
      ],
    });

    await h.adapter.boot();
    expect(h.adapter.board()).toEqual(opening);

    await h.adapter.submitMove(endTurn());

    const posts = apiCalls(h, 'POST', `/games/${GROUP_HASH}/${GAME_ONE}/moves`);
    expect(posts).toHaveLength(1);
    const posted = posts[0];
    expect(posted).toBeDefined();
    if (posted === undefined) return;
    expect(ifMatchOf(posted)).toBe(quotedVersion(0));
    expect(parseJson(posted.body)).toEqual({ move: endTurn() });

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
    expect(h.adapter.board()).toEqual(afterGet);
    expect(h.adapter.board()).not.toEqual(opening);
  });
});
