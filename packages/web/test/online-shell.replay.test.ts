/**
 * Host conversation replay: GIS sign-in → `#/g/…` via hash handler → POST
 * `endTurn` → board equals the second GET (not a local apply).
 *
 * Does not re-record rules-core goldens.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, GOOGLE_ID_TOKEN_SESSION_KEY } from '@conquarrow/contracts';
import {
  ALICE,
  GAME_ONE,
  GROUP_HASH,
  accessTokenOf,
  apiCalls,
  boardAt,
  gameHash,
  getGameScript,
  ifMatchOf,
  makeHostHarness,
  openingBoard,
  parseJson,
  postMoveScript,
  quotedVersion,
} from './online-shell.support';

describe('an online Pages host conversation replay reproduces GET state', () => {
  it('sign-in → open #/g/… via hash handler → submit endTurn → board equals the second GET', async () => {
    const opening = openingBoard('replay-opening');
    const afterGet = boardAt(1, { activePlayer: 'B', tag: 'replay-second-get' });
    const h = makeHostHarness({
      fetchScript: [
        getGameScript(opening),
        postMoveScript(200, { version: 1, groupHash: GROUP_HASH, gameNumber: GAME_ONE }),
        getGameScript(afterGet),
      ],
    });

    await h.host.boot();
    await h.host.handleGisCredential(ALICE.bearer);
    expect(h.session.getItem(GOOGLE_ID_TOKEN_SESSION_KEY)).toBe(ALICE.bearer);
    expect(h.sockets).toHaveLength(1);
    const socket = h.sockets[0];
    expect(socket).toBeDefined();
    if (socket === undefined) return;
    expect(accessTokenOf(socket.url)).toBe(ALICE.bearer);

    h.location.hash = gameHash(GROUP_HASH, GAME_ONE);
    await h.host.handleHashChange();
    expect(h.host.board()).toEqual(opening);

    await h.host.submitMove(endTurn());

    const posts = apiCalls(h, 'POST', `/games/${GROUP_HASH}/${GAME_ONE}/moves`);
    expect(posts).toHaveLength(1);
    const posted = posts[0];
    expect(posted).toBeDefined();
    if (posted === undefined) return;
    expect(ifMatchOf(posted)).toBe(quotedVersion(0));
    expect(parseJson(posted.body)).toEqual({ move: endTurn() });

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
    expect(h.host.board()).toEqual(afterGet);
    expect(h.host.board()).not.toEqual(opening);
  });
});
