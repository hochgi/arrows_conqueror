/**
 * docs/spec/online-shell/online-shell.core.feature — one test per scenario.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, GOOGLE_ID_TOKEN_SESSION_KEY } from '@conquarrow/contracts';
import {
  ALICE,
  BOB,
  GAME_ONE,
  GROUP_HASH,
  INVITE_TOKEN,
  ONE_HUMAN_TWO_HEURISTIC,
  TWO_HUMAN_HEURISTIC,
  accessTokenOf,
  aliceBobSeats,
  aliceHostSeats,
  apiCalled,
  apiCalls,
  boardAt,
  createInviteScript,
  gameHash,
  getGameScript,
  humanBoundCount,
  inviteHash,
  makeHostHarness,
  openingBoard,
  peekInviteScript,
  postMoveScript,
  stateChangedJson,
} from './online-shell.support';

describe('Env and Local', () => {
  it('Missing env hides Online', async () => {
    const h = makeHostHarness({ env: { VITE_GOOGLE_CLIENT_ID: '' } });
    await h.host.boot();

    expect(h.host.onlineModeOffered()).toBe(false);

    await h.host.start();

    expect(h.host.localMatchStarted()).toBe(true);
    expect(apiCalled(h)).toBe(false);
    expect(h.sockets).toHaveLength(0);
  });

  it('Local Start never calls the API', async () => {
    const h = makeHostHarness();
    await h.host.boot();
    h.host.selectMode('local');
    h.host.setSeatPlan(ONE_HUMAN_TWO_HEURISTIC);

    await h.host.start();

    expect(h.host.localMatchStarted()).toBe(true);
    expect(apiCalled(h)).toBe(false);
    expect(h.sockets).toHaveLength(0);
  });
});

describe('GIS and session', () => {
  it('GIS yield signs in and opens a WebSocket', async () => {
    const h = makeHostHarness();
    await h.host.boot();

    await h.host.handleGisCredential(ALICE.bearer);

    expect(h.session.getItem(GOOGLE_ID_TOKEN_SESSION_KEY)).toBe(ALICE.bearer);
    expect(h.sockets).toHaveLength(1);
    const socket = h.sockets[0];
    expect(socket).toBeDefined();
    if (socket === undefined) return;
    expect(accessTokenOf(socket.url)).toBe(ALICE.bearer);
    expect(socket.url.startsWith(`${h.env.VITE_WS_URL}?`)).toBe(true);
  });

  it('Sign-out from the host clears the session', async () => {
    const h = makeHostHarness({ sessionToken: ALICE.bearer });
    await h.host.boot();
    expect(h.sockets).toHaveLength(1);
    const socket = h.sockets[0];
    expect(socket).toBeDefined();
    if (socket === undefined) return;

    h.host.signOut();

    expect(h.session.getItem(GOOGLE_ID_TOKEN_SESSION_KEY)).toBeNull();
    expect(socket.closed).toBe(true);
  });
});

describe('Hash and invite', () => {
  it('Unsigned invite hash peeks then prompts GIS', async () => {
    const h = makeHostHarness({
      hash: inviteHash(INVITE_TOKEN),
      fetchScript: [peekInviteScript(INVITE_TOKEN, aliceHostSeats())],
    });

    await h.host.boot();

    expect(apiCalls(h, 'GET', `/invites/${INVITE_TOKEN}`)).toHaveLength(1);
    expect(h.gis.prompted).toBe(true);
    expect(apiCalls(h, 'POST', `/invites/${INVITE_TOKEN}/accept`)).toHaveLength(0);
    expect(h.host.mode()).toBe('online');
  });

  it('Signed-in invite offers Accept and does not auto-accept', async () => {
    const h = makeHostHarness({
      sessionToken: BOB.bearer,
      hash: inviteHash(INVITE_TOKEN),
      fetchScript: [peekInviteScript(INVITE_TOKEN, aliceHostSeats())],
    });

    await h.host.boot();

    expect(h.host.mode()).toBe('online');
    expect(h.host.acceptOffered()).toBe(true);
    expect(apiCalls(h, 'POST', `/invites/${INVITE_TOKEN}/accept`)).toHaveLength(0);
  });

  it('Online Start is offered only when humans are bound', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [
        createInviteScript(INVITE_TOKEN),
        peekInviteScript(INVITE_TOKEN, aliceBobSeats()),
      ],
    });
    await h.host.boot();
    h.host.selectMode('online');
    h.host.setSeatPlan(TWO_HUMAN_HEURISTIC);
    await h.host.createInvite();
    expect(humanBoundCount(h.host.adapter().inviteSeats())).toBe(1);

    expect(h.host.startOffered()).toBe(false);

    h.location.hash = inviteHash(INVITE_TOKEN);
    await h.host.handleHashChange();

    expect(humanBoundCount(h.host.adapter().inviteSeats())).toBe(2);
    expect(h.host.startOffered()).toBe(true);
  });
});

describe('Wake-ups', () => {
  it('WS onmessage GETs the open game', async () => {
    const woken = boardAt(1, { activePlayer: 'B', tag: 'ws-host-get' });
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [getGameScript(openingBoard()), getGameScript(woken)],
    });
    await h.host.boot();
    expect(h.host.board()?.version).toBe(0);

    await h.host.handleSocketMessage(stateChangedJson(1));

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
    expect(h.host.board()).toEqual(woken);
  });

  it('visibilitychange GETs the open game', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [getGameScript(openingBoard()), getGameScript(openingBoard())],
    });
    await h.host.boot();

    await h.host.handleVisibility(true);

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
  });

  it('hashchange boots the new hash', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [getGameScript(openingBoard())],
    });
    await h.host.boot();
    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(0);

    h.location.hash = gameHash(GROUP_HASH, GAME_ONE);
    await h.host.handleHashChange();

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(1);
    expect(h.host.board()?.version).toBe(0);
  });
});

describe('Play', () => {
  it('Online move uses the GET board', async () => {
    const after = boardAt(1, { activePlayer: 'B', tag: 'after-endTurn-get' });
    const opening = openingBoard();
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [
        getGameScript(opening),
        postMoveScript(200, { version: 1, groupHash: GROUP_HASH, gameNumber: GAME_ONE }),
        getGameScript(after),
      ],
    });
    await h.host.boot();
    expect(h.host.board()).toEqual(opening);

    await h.host.submitMove(endTurn());

    expect(apiCalls(h, 'POST', `/games/${GROUP_HASH}/${GAME_ONE}/moves`)).toHaveLength(1);
    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
    expect(h.host.board()).toEqual(after);
    expect(h.host.board()).not.toEqual(opening);
  });
});
