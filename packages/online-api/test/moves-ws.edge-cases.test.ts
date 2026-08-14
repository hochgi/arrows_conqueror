/**
 * docs/spec/online-moves-ws/online-moves-ws.edge-cases.feature — one test per scenario.
 *
 * Concurrent accept uses overlapping gets of the same invite JSON (no If-Match
 * on the HTTP accept). The server retries on If-Match so two writers cannot
 * bind the same chair; the loser takes the next unbound human seat or 409 if full.
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
  DAVE,
  GAME_ONE,
  GAME_TWO,
  THREE_HUMAN,
  TWO_HUMAN_HEURISTIC,
  aliceBobCarolGroupHash,
  aliceBobGroupHash,
  aliceHash,
  asRecord,
  bindAliceAndBob,
  bobHash,
  boundUserHash,
  carolHash,
  connectionIdKey,
  connectionKey,
  connectionKeys,
  createOpenInvite,
  daveHash,
  expectNoSubLeak,
  expectStatus,
  expectWsStatus,
  gameLogKey,
  gameMetaKey,
  gameStateKey,
  getGame,
  goneReason,
  illegalStep,
  inviteKey,
  makeHarness,
  notifiesTo,
  overlappingGetStore,
  parseBody,
  playLogKeys,
  postAccept,
  postMove,
  postStart,
  seatSummaries,
  seedFinishedState,
  seedOpeningState,
  startAliceBob,
  startAliceBobCarol,
  storedVersion,
  winnerOf,
  wsConnect,
  stateOfBody,
} from './support';

describe('Authz', () => {
  it('Unauthenticated GET game is 401', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();

    const res = await getGame(api, groupHash, GAME_ONE);

    expectStatus(res, 401);
    expect(s3.has(gameStateKey(groupHash, GAME_ONE))).toBe(false);
  });

  it('Unauthenticated POST moves is 401', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);

    const res = await postMove(api, groupHash, GAME_ONE, undefined, endTurn(), 0);

    expectStatus(res, 401);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
  });

  it('WebSocket connect without a token is 401', async () => {
    const { ws, s3 } = makeHarness();

    const res = await wsConnect(ws, ALICE_CONN);

    expect(res.statusCode).toBe(401);
    expect(connectionKeys(s3)).toEqual([]);
  });

  it('Non-member GET does not materialise', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();

    const res = await getGame(api, groupHash, GAME_ONE, CAROL.bearer);

    expectStatus(res, 403);
    expect(s3.has(gameStateKey(groupHash, GAME_ONE))).toBe(false);
  });

  it('Bound human who is not to move is 403', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    const logBefore = s3.get(gameLogKey(groupHash, GAME_ONE));

    const res = await postMove(api, groupHash, GAME_ONE, BOB.bearer, endTurn(), 0);

    expectStatus(res, 403);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
    expect(s3.get(gameLogKey(groupHash, GAME_ONE))).toBe(logBefore);
  });

  it('Unknown game is 404', async () => {
    const { api } = makeHarness();
    const dead = 'deadbeefdeadbeefdeadbeefdeadbeef';

    const getRes = await getGame(api, dead, GAME_ONE, ALICE.bearer);
    expectStatus(getRes, 404);

    const postRes = await postMove(api, dead, GAME_ONE, ALICE.bearer, endTurn(), 0);
    expectStatus(postRes, 404);
  });
});

describe('Concurrency and legality', () => {
  it('Missing If-Match is 428', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn());

    expectStatus(res, 428);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
  });

  it('Stale If-Match is 412', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 412);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
  });

  it('Illegal move is 422', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    const logBefore = s3.get(gameLogKey(groupHash, GAME_ONE));

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, illegalStep(), 0);

    expectStatus(res, 422);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
    expect(s3.get(gameLogKey(groupHash, GAME_ONE))).toBe(logBefore);
  });

  it('POST after winner is 409 finished', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    const { version } = seedFinishedState(s3, groupHash, GAME_ONE, 3);
    const snapshot = new Map(s3);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), version);

    expectStatus(res, 409);
    expect(asRecord(parseBody(res))['reason']).toBe('finished');
    expect([...s3.entries()]).toEqual([...snapshot.entries()]);
  });

  it('Member GET of a finished game is 200', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    const { winner } = seedFinishedState(s3, groupHash, GAME_ONE, 3);

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    const meta = JSON.parse(s3.get(gameMetaKey(groupHash, GAME_ONE)) ?? '{}') as unknown;
    expect(winnerOf(stateOfBody(parseBody(res)))).toBe(winner);
    expect(winnerOf(stateOfBody(parseBody(res)))).toBe(winnerOf(meta));
  });

  it('POST without a prior GET still ensures then applies', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expect(playLogKeys(s3)).toEqual([]);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(asRecord(parseBody(res))['version']).toBe(1);
    expect(s3.has(gameStateKey(groupHash, GAME_ONE))).toBe(true);
    expect(s3.has(gameLogKey(groupHash, GAME_ONE))).toBe(true);
  });
});

describe('Notify hygiene', () => {
  it('Gone connection id is dropped', async () => {
    const { api, s3, ws, notifies } = makeHarness({
      goneConnectionIds: new Set([BOB_CONN]),
    });
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    s3.set(connectionKey(bobHash(), BOB_CONN), '{}');
    s3.set(connectionKey(carolHash(), CAROL_CONN), '{}');
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    expectWsStatus(await wsConnect(ws, CAROL_CONN, CAROL.bearer), 200);
    seedOpeningState(s3, groupHash, GAME_ONE, 3);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(s3.has(connectionKey(bobHash(), BOB_CONN))).toBe(false);
    expect(s3.has(connectionIdKey(BOB_CONN))).toBe(false);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
    expect(notifiesTo(notifies, CAROL_CONN).map((row) => row.payload)).toContainEqual({
      type: 'stateChanged',
      version: 1,
      groupHash,
      gameNumber: GAME_ONE,
    });
  });

  it('Heuristic seats are not notified', async () => {
    const { api, s3, ws, notifies } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectWsStatus(await wsConnect(ws, ALICE_CONN, ALICE.bearer), 200);
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    seedOpeningState(s3, groupHash, GAME_ONE, 3);

    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);

    const targets = notifies
      .filter((row) => row.payload.version === 1)
      .map((row) => row.connectionId);
    expect(targets).toEqual([BOB_CONN]);
  });

  it('Notify failure after persist still returns 200', async () => {
    const { api, s3, ws } = makeHarness({
      postToConnection: () => {
        throw new Error('PostToConnection unavailable');
      },
    });
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    seedOpeningState(s3, groupHash, GAME_ONE, 3);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
  });
});

describe('P17 follow-on races', () => {
  it('Concurrent accept does not share a chair', async () => {
    const data = new Map<string, string>();
    const store = overlappingGetStore(
      data,
      (key) => key.includes('/invites/') && key.endsWith('.json'),
    );
    const { api, s3 } = makeHarness({ s3: data, store });
    const token = await createOpenInvite(api, ALICE, THREE_HUMAN);
    store.arm();

    const [bobRes, carolRes] = await Promise.all([
      postAccept(api, token, BOB.bearer),
      postAccept(api, token, CAROL.bearer),
    ]);

    expect([bobRes.statusCode, carolRes.statusCode].sort()).toEqual([200, 200]);
    const bobSeats = seatSummaries(parseBody(bobRes));
    const carolSeats = seatSummaries(parseBody(carolRes));
    const bobChair = bobSeats.findIndex((seat) => boundUserHash(seat) === bobHash());
    const carolChair = carolSeats.findIndex((seat) => boundUserHash(seat) === carolHash());
    expect(bobChair).toBeGreaterThanOrEqual(0);
    expect(carolChair).toBeGreaterThanOrEqual(0);
    expect(bobChair).not.toBe(carolChair);
    const stored = seatSummaries(JSON.parse(s3.get(inviteKey(token)) ?? '{}') as unknown);
    const hashes = stored.map((seat) => boundUserHash(seat)).filter((h) => h !== undefined);
    expect(hashes).toContain(aliceHash());
    expect(hashes).toContain(bobHash());
    expect(hashes).toContain(carolHash());
    expect(new Set(hashes).size).toBe(3);
  });

  it('Last chair concurrent accept is 409 for the loser', async () => {
    const data = new Map<string, string>();
    const store = overlappingGetStore(
      data,
      (key) => key.includes('/invites/') && key.endsWith('.json'),
    );
    const { api, s3 } = makeHarness({ s3: data, store });
    const token = await createOpenInvite(api, ALICE, THREE_HUMAN);
    expectStatus(await postAccept(api, token, DAVE.bearer), 200);
    store.arm();

    const [bobRes, carolRes] = await Promise.all([
      postAccept(api, token, BOB.bearer),
      postAccept(api, token, CAROL.bearer),
    ]);

    const codes = [bobRes.statusCode, carolRes.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const stored = seatSummaries(JSON.parse(s3.get(inviteKey(token)) ?? '{}') as unknown);
    expect(stored).toHaveLength(3);
    const hashes = stored.map((seat) => boundUserHash(seat)).filter((h) => h !== undefined);
    expect(hashes).toHaveLength(3);
    expect(hashes).toContain(aliceHash());
    expect(hashes).toContain(daveHash());
    expect(hashes.includes(bobHash()) !== hashes.includes(carolHash())).toBe(true);
  });

  it('Start does not overwrite an existing game number', async () => {
    const { api, s3 } = makeHarness();
    const groupHash = aliceBobGroupHash();
    await startAliceBob(api);
    const firstMeta = s3.get(gameMetaKey(groupHash, GAME_ONE));
    expect(firstMeta).toBeDefined();

    const token = await createOpenInvite(api, ALICE, TWO_HUMAN_HEURISTIC);
    expectStatus(await postAccept(api, token, BOB.bearer), 200);
    const started = expectStatus(await postStart(api, token, ALICE.bearer), 200);

    expect(parseBody(started)).toEqual({ groupHash, gameNumber: GAME_TWO });
    expect(s3.get(gameMetaKey(groupHash, GAME_ONE))).toBe(firstMeta);
  });

  it('Retry Start finishes the same game', async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const groupHash = aliceBobGroupHash();
    const inviteRaw = s3.get(inviteKey(token));
    expect(inviteRaw).toBeDefined();
    if (inviteRaw === undefined) return;
    const seats = asRecord(JSON.parse(inviteRaw) as unknown)['seats'];
    s3.set(gameMetaKey(groupHash, GAME_ONE), JSON.stringify({ seats }));

    const res = await postStart(api, token, ALICE.bearer);

    expectStatus(res, 200);
    expect(parseBody(res)).toEqual({ groupHash, gameNumber: GAME_ONE });
    expect(s3.has(gameMetaKey(groupHash, GAME_TWO))).toBe(false);
    const invite = JSON.parse(s3.get(inviteKey(token)) ?? '{}') as unknown;
    expect(asRecord(invite)['status']).toBe('started');
  });

  it("Start does not claim another invite's game number", async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const groupHash = aliceBobGroupHash();
    const inviteRaw = s3.get(inviteKey(token));
    expect(inviteRaw).toBeDefined();
    if (inviteRaw === undefined) return;
    const seats = asRecord(JSON.parse(inviteRaw) as unknown)['seats'];
    s3.set(
      gameMetaKey(groupHash, GAME_ONE),
      JSON.stringify({ seats, inviteToken: 'other-token' }),
    );

    const started = expectStatus(await postStart(api, token, ALICE.bearer), 200);

    expect(parseBody(started)).toEqual({ groupHash, gameNumber: GAME_TWO });
    const kept = asRecord(JSON.parse(s3.get(gameMetaKey(groupHash, GAME_ONE)) ?? '{}') as unknown);
    expect(kept['inviteToken']).toBe('other-token');
  });

  it('Concurrent Start on the same token allocates one game', async () => {
    const data = new Map<string, string>();
    const store = overlappingGetStore(
      data,
      (key) => key.includes('/invites/') && key.endsWith('.json'),
    );
    const { api, s3 } = makeHarness({ s3: data, store });
    const token = await bindAliceAndBob(api);
    store.arm();

    const [aliceRes, bobRes] = await Promise.all([
      postStart(api, token, ALICE.bearer),
      postStart(api, token, BOB.bearer),
    ]);

    const groupHash = aliceBobGroupHash();
    const succeeded = [aliceRes, bobRes].filter((res) => res.statusCode === 200);
    const closed = [aliceRes, bobRes].filter((res) => res.statusCode === 410);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    expect(succeeded.length + closed.length).toBe(2);
    for (const res of succeeded) {
      expect(parseBody(res)).toEqual({ groupHash, gameNumber: GAME_ONE });
    }
    for (const res of closed) {
      expect(goneReason(parseBody(res))).toBe('started');
    }
    expect(s3.has(gameMetaKey(groupHash, GAME_TWO))).toBe(false);
  });

  it('After completed Start the token is still 410', async () => {
    const { api } = makeHarness();
    const token = await startAliceBob(api);

    const res = await postStart(api, token, ALICE.bearer);

    expectStatus(res, 410);
    expect(goneReason(parseBody(res))).toBe('started');
  });
});

describe('Stub retirement', () => {
  it('P16 POST /moves stub is gone', async () => {
    const { api } = makeHarness();

    const res = await api.handle({
      method: 'POST',
      path: '/moves',
      headers: { authorization: `Bearer ${ALICE.bearer}` },
    });

    expect(res.statusCode).not.toBe(501);
    expect(res.statusCode).toBe(404);
    expectNoSubLeak(res, ALICE.sub);
  });
});
