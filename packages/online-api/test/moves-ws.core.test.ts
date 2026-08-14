/**
 * docs/spec/online-moves-ws/online-moves-ws.core.feature — one test per scenario.
 *
 * @see docs/spec/online-moves-ws/online-moves-ws.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn } from '@conquarrow/contracts';
import {
  ALICE,
  ALICE_CONN,
  BOB,
  BOB_CONN,
  CAROL,
  CAROL_CONN,
  FAY,
  GAME_ONE,
  aliceBobCarolGroupHash,
  aliceBobGroupHash,
  aliceFayGroupHash,
  aliceHash,
  authorStarvationWrapState,
  connectionKey,
  countingPutStore,
  expectNoSubLeak,
  expectStatus,
  expectWsStatus,
  firstLegalStep,
  gameLogKey,
  gameMetaKey,
  gameStateKey,
  getGame,
  makeHarness,
  notifiesTo,
  openingMatch,
  parseBody,
  parseLogJsonl,
  parsePersisted,
  persistEnvelope,
  playLogKeys,
  postMove,
  startAliceBob,
  startAliceBobCarol,
  startAliceFayBurst,
  startBobAliceHeuristic,
  startHeuristicThenAliceBob,
  stateOfBody,
  storedVersion,
  versionOf,
  winnerOf,
  wsConnect,
  wsDisconnect,
  activePlayerOf,
  playersOf,
} from './support';

describe('Ensure opening', () => {
  it('First member GET materialises opening at version 0', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expect(playLogKeys(s3)).toEqual([]);

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    const body = parseBody(res);
    expect(versionOf(body)).toBe(0);
    const state = stateOfBody(body);
    expect(playersOf(state)).toHaveLength(3);
    expect(activePlayerOf(state)).toBe(String(openingMatch(3).players[0]));
    expect(s3.has(gameStateKey(groupHash, GAME_ONE))).toBe(true);
    expect(s3.has(gameLogKey(groupHash, GAME_ONE))).toBe(true);
    expectNoSubLeak(res, ALICE.sub);
    expectNoSubLeak(res, BOB.sub);
  });

  it('Opening GET runs heuristic seats before the first human', async () => {
    const { api, s3, ws, notifies } = makeHarness();
    await startHeuristicThenAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectWsStatus(await wsConnect(ws, ALICE_CONN, ALICE.bearer), 200);
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    const body = parseBody(res);
    expect(versionOf(body)).toBe(0);
    expect(activePlayerOf(stateOfBody(body))).toBe(String(openingMatch(3).players[1]));
    expect(parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)))).toEqual([endTurn()]);
    const payload = {
      type: 'stateChanged',
      version: 0,
      groupHash,
      gameNumber: GAME_ONE,
    };
    expect(notifiesTo(notifies, BOB_CONN).map((row) => row.payload)).toContainEqual(payload);
    expect(notifiesTo(notifies, ALICE_CONN)).toEqual([]);
  });
});

describe('Human move then next human', () => {
  it('Human move with next seat human is one apply', async () => {
    const { api, s3, ws, notifies } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    expectWsStatus(await wsConnect(ws, ALICE_CONN, ALICE.bearer), 200);
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    expectWsStatus(await wsConnect(ws, CAROL_CONN, CAROL.bearer), 200);
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const move = firstLegalStep(openingMatch(3));

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, move, 0);

    expectStatus(res, 200);
    expect(versionOf(parseBody(res))).toBe(1);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
    expect(parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)))).toEqual([move]);
    const payload = {
      type: 'stateChanged',
      version: 1,
      groupHash,
      gameNumber: GAME_ONE,
    };
    expect(notifiesTo(notifies, BOB_CONN).map((row) => row.payload)).toContainEqual(payload);
    expect(notifiesTo(notifies, CAROL_CONN).map((row) => row.payload)).toContainEqual(payload);
    expect(notifiesTo(notifies, ALICE_CONN).filter((row) => row.payload.version === 1)).toEqual([]);
  });
});

describe('Heuristic burst', () => {
  it('Human endTurn then four heuristic seats persist once', async () => {
    const data = new Map<string, string>();
    const store = countingPutStore(data);
    const { api, s3 } = makeHarness({ s3: data, store });
    await startAliceFayBurst(api);
    const groupHash = aliceFayGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const statePutsBefore = store.puts.filter((key) => key.endsWith('/state.json')).length;

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(versionOf(parseBody(res))).toBe(1);
    expect(parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)))).toHaveLength(5);
    const fayGet = expectStatus(await getGame(api, groupHash, GAME_ONE, FAY.bearer), 200);
    expect(activePlayerOf(stateOfBody(parseBody(fayGet)))).toBe(String(openingMatch(6).players[5]));
    expect(store.puts.filter((key) => key.endsWith('/state.json')).length).toBe(
      statePutsBefore + 1,
    );
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
  });

  it('Burst that ends the game mid-AI persists terminal state', async () => {
    const { api, s3, heuristicAsks } = makeHarness();
    await startBobAliceHeuristic(api);
    const groupHash = aliceBobGroupHash();
    const authored = authorStarvationWrapState();
    s3.set(gameStateKey(groupHash, GAME_ONE), persistEnvelope(0, authored.state));
    s3.set(gameLogKey(groupHash, GAME_ONE), '');
    const asksBefore = heuristicAsks.length;

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    const got = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const winner = winnerOf(stateOfBody(parseBody(got)));
    expect(winner).toBe(authored.winner);
    const meta = JSON.parse(s3.get(gameMetaKey(groupHash, GAME_ONE)) ?? '{}') as unknown;
    expect(winnerOf(meta)).toBe(winner);
    const log = parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)));
    expect(log.at(-1)).toEqual(endTurn());
    expect(log.length).toBeGreaterThanOrEqual(2);
    const asks = heuristicAsks.slice(asksBefore);
    expect(asks.some((state) => state.winner !== undefined)).toBe(false);
    expect(asks.length).toBe(1);
  });
});

describe('Library refresh', () => {
  it('Member GET after a move returns the new version', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    expect(versionOf(parseBody(res))).toBe(1);
    expect(stateOfBody(parseBody(res))).toEqual(
      parsePersisted(s3.get(gameStateKey(groupHash, GAME_ONE))).state,
    );
  });
});

describe('WebSocket registry', () => {
  it('Connect stores a pointer and disconnect deletes it', async () => {
    const { ws, s3 } = makeHarness();
    const keysBefore = [...s3.keys()].sort();

    const connected = await wsConnect(ws, ALICE_CONN, ALICE.bearer);
    expect(connected.statusCode).toBe(200);
    expect(s3.has(connectionKey(aliceHash(), ALICE_CONN))).toBe(true);

    const disconnected = await wsDisconnect(ws, ALICE_CONN, aliceHash());
    expect(disconnected.statusCode).toBe(200);
    expect(s3.has(connectionKey(aliceHash(), ALICE_CONN))).toBe(false);
    const leftover = [...s3.keys()]
      .filter((key) => key.includes('/groups/') || key.includes('/games/'))
      .sort();
    expect(leftover).toEqual(
      keysBefore.filter((key) => key.includes('/groups/') || key.includes('/games/')),
    );
  });
});
