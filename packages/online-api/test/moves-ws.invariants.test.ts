/**
 * EARS invariants for docs/spec/online-moves-ws/online-moves-ws.md.
 *
 * Table-driven / small explicit generators in Vitest — this repo has no
 * fast-check (same style as packages/online-api/test/auth-invites.invariants.test.ts).
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
  EXPIRED_BEARER,
  GAME_ONE,
  GAME_TWO,
  INVALID_BEARER,
  THREE_HUMAN,
  TWO_HUMAN_HEURISTIC,
  aliceBobCarolGroupHash,
  aliceBobGroupHash,
  asRecord,
  bindAliceAndBob,
  bobHash,
  connectionKey,
  connectionKeys,
  countingPutStore,
  createOpenInvite,
  expectNoSubLeak,
  expectStatus,
  expectWsStatus,
  firstLegalStep,
  gameLogKey,
  gameMetaKey,
  gameStateKey,
  getGame,
  getInvite,
  goneReason,
  groupAndGameKeys,
  illegalStep,
  inviteKey,
  makeHarness,
  notifiesTo,
  openingMatch,
  overlappingGetStore,
  parseBody,
  parseLogJsonl,
  persistEnvelope,
  playLogKeys,
  postAccept,
  postMove,
  postStart,
  seedFinishedState,
  startBobAliceHeuristic,
  authorWinningWrapState,
  seedOpeningState,
  snapshotState,
  startAliceBob,
  startAliceBobCarol,
  storedVersion,
  throwingPutStore,
  versionOf,
  winnerOf,
  wsConnect,
  stateOfBody,
} from './support';

describe('online-moves-ws invariants', () => {
  it('When a request has no valid Google ID token, the system shall respond 401 on GET game, POST moves, and WebSocket $connect, and shall not write S3', async () => {
    const { api, s3, ws } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    const before = [...s3.keys()].sort();
    const bearers: readonly (string | undefined)[] = [undefined, EXPIRED_BEARER, INVALID_BEARER];
    for (const bearer of bearers) {
      const label = bearer ?? 'missing';
      const getRes = await getGame(api, groupHash, GAME_ONE, bearer);
      const postRes = await postMove(api, groupHash, GAME_ONE, bearer, endTurn(), 0);
      expect(getRes.statusCode, `GET game (${label})`).toBe(401);
      expect(postRes.statusCode, `POST moves (${label})`).toBe(401);
    }
    const connected = await wsConnect(ws, ALICE_CONN);
    expect(connected.statusCode).toBe(401);
    expect([...s3.keys()].sort()).toEqual(before);
    expect(connectionKeys(s3)).toEqual([]);
  });

  it('If the caller is not a bound human on that game, then the system shall reject GET and POST with 403 and shall not write state.json or log.jsonl', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, CAROL.bearer), 403);
    expectStatus(await postMove(api, groupHash, GAME_ONE, CAROL.bearer, endTurn(), 0), 403);
    expect(playLogKeys(s3)).toEqual([]);
  });

  it('When game meta is missing, the system shall respond 404 on GET and POST and shall not create a game', async () => {
    const { api, s3 } = makeHarness();
    const dead = 'deadbeefdeadbeefdeadbeefdeadbeef';
    const before = groupAndGameKeys(s3);
    expectStatus(await getGame(api, dead, GAME_ONE, ALICE.bearer), 404);
    expectStatus(await postMove(api, dead, GAME_ONE, ALICE.bearer, endTurn(), 0), 404);
    expect(groupAndGameKeys(s3)).toEqual(before);
    expect(playLogKeys(s3)).toEqual([]);
  });

  it('When state.json is missing and a bound human GETs or POSTs, the system shall ensure makeMatch with playerCount equal to the seat plan length, then the opening burst if needed, then persist at version 0', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    const got = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expect(versionOf(parseBody(got))).toBe(0);
    expect(stateOfBody(parseBody(got))).toEqual(snapshotState(openingMatch(3)));
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);

    const fresh = makeHarness();
    await startAliceBob(fresh.api);
    const post = expectStatus(
      await postMove(fresh.api, aliceBobGroupHash(), GAME_ONE, ALICE.bearer, endTurn(), 0),
      200,
    );
    expect(versionOf(parseBody(post))).toBe(1);
    expect(fresh.s3.has(gameStateKey(aliceBobGroupHash(), GAME_ONE))).toBe(true);
  });

  it('When ensure races, the system shall create state.json with If-None-Match so a second writer does not overwrite; the loser shall read the winners object', async () => {
    const data = new Map<string, string>();
    const counting = countingPutStore(data);
    const store = overlappingGetStore(data, (key) => key.endsWith('/state.json'));
    const wrapped = {
      get: store.get,
      put: counting.put,
      delete: store.delete,
      listPrefix: store.listPrefix,
    };
    const { api } = makeHarness({ s3: data, store: wrapped });
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    store.arm();

    const [a, b] = await Promise.all([
      getGame(api, groupHash, GAME_ONE, ALICE.bearer),
      getGame(api, groupHash, GAME_ONE, BOB.bearer),
    ]);
    expectStatus(a, 200);
    expectStatus(b, 200);
    expect(versionOf(parseBody(a))).toBe(0);
    expect(versionOf(parseBody(b))).toBe(0);
    expect(stateOfBody(parseBody(a))).toEqual(stateOfBody(parseBody(b)));
    expect(counting.puts.filter((key) => key.endsWith('/state.json'))).toHaveLength(1);
  });

  it('When POST moves omits If-Match, the system shall respond 428 and shall not apply', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn()), 428);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
    expect(parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)))).toEqual([]);
  });

  it('When If-Match does not equal the stored quoted version, the system shall respond 412 and shall not apply', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 412);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
  });

  it('When the bearer is not the active human seat, the system shall respond 403 and shall not apply', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, BOB.bearer, endTurn(), 0), 403);
    expectStatus(await postMove(api, groupHash, GAME_ONE, CAROL.bearer, endTurn(), 0), 403);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
  });

  it('When apply rejects the move as illegal, the system shall respond 422 and shall not persist', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, illegalStep(), 0), 422);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(0);
  });

  it('When state.winner is already set, the system shall reject POST moves with 409 finished and shall not persist', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedFinishedState(s3, groupHash, GAME_ONE, 3);
    const before = s3.get(gameStateKey(groupHash, GAME_ONE));
    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);
    expectStatus(res, 409);
    expect(asRecord(parseBody(res))['reason']).toBe('finished');
    expect(s3.get(gameStateKey(groupHash, GAME_ONE))).toBe(before);
  });

  it('When a persist first sets state.winner, the system shall write that PlayerId onto that games meta.json as winner', async () => {
    const { api, s3 } = makeHarness();
    await startBobAliceHeuristic(api);
    const groupHash = aliceBobGroupHash();
    const authored = authorWinningWrapState();
    s3.set(gameStateKey(groupHash, GAME_ONE), persistEnvelope(0, authored.state));
    s3.set(gameLogKey(groupHash, GAME_ONE), '');
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);
    const got = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const bodyWinner = winnerOf(stateOfBody(parseBody(got)));
    expect(bodyWinner).toBe(authored.winner);
    const meta = JSON.parse(s3.get(gameMetaKey(groupHash, GAME_ONE)) ?? '{}') as unknown;
    expect(winnerOf(meta)).toBe(bodyWinner);
  });

  it('When POST moves succeeds, the system shall apply the human move, then run the burst, persist once, increment version by 1, and notify other bound humans', async () => {
    const data = new Map<string, string>();
    const store = countingPutStore(data);
    const { api, s3, ws, notifies } = makeHarness({ s3: data, store });
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    expectWsStatus(await wsConnect(ws, CAROL_CONN, CAROL.bearer), 200);
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    const putsBefore = store.puts.filter((key) => key.endsWith('/state.json')).length;
    const move = firstLegalStep(openingMatch(3));
    const res = expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, move, 0), 200);
    expect(versionOf(parseBody(res))).toBe(1);
    expect(parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)))).toEqual([move]);
    expect(store.puts.filter((key) => key.endsWith('/state.json')).length).toBe(putsBefore + 1);
    expect(notifiesTo(notifies, BOB_CONN).some((row) => row.payload.version === 1)).toBe(true);
    expect(notifiesTo(notifies, CAROL_CONN).some((row) => row.payload.version === 1)).toBe(true);
    expect(notifiesTo(notifies, ALICE_CONN).some((row) => row.payload.version === 1)).toBe(false);
  });

  it('While the Lambda does not finish a persist, the system shall leave state.json and log.jsonl unchanged so the client may retry the same move and version', async () => {
    const data = new Map<string, string>();
    let armed = false;
    const store = throwingPutStore(data, (key) => armed && key.endsWith('/state.json'));
    const { api, s3 } = makeHarness({ s3: data, store });
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    const stateBefore = s3.get(gameStateKey(groupHash, GAME_ONE));
    const logBefore = s3.get(gameLogKey(groupHash, GAME_ONE));
    armed = true;
    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);
    expect(res.statusCode, 'POST moves should be mapped').not.toBe(404);
    expect(s3.get(gameStateKey(groupHash, GAME_ONE))).toBe(stateBefore);
    expect(s3.get(gameLogKey(groupHash, GAME_ONE))).toBe(logBefore);
  });

  it('The system shall not include Google sub in HTTP or WebSocket bodies', async () => {
    const { api, ws, notifies } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    const got = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expectNoSubLeak(got, ALICE.sub);
    expectNoSubLeak(got, BOB.sub);
    expectNoSubLeak(got, CAROL.sub);
    const posted = expectStatus(
      await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0),
      200,
    );
    expectNoSubLeak(posted, ALICE.sub);
    for (const row of notifies) {
      expect(JSON.stringify(row.payload)).not.toContain(ALICE.sub);
      expect(JSON.stringify(row.payload)).not.toContain(BOB.sub);
    }
  });

  it('The system shall not send stateChanged to the caller or to heuristic seats', async () => {
    const { api, s3, ws, notifies } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectWsStatus(await wsConnect(ws, ALICE_CONN, ALICE.bearer), 200);
    expectWsStatus(await wsConnect(ws, BOB_CONN, BOB.bearer), 200);
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);
    const changed = notifies.filter((row) => row.payload.version === 1);
    expect(changed.map((row) => row.connectionId)).toEqual([BOB_CONN]);
  });

  it('When PostToConnection reports the connection gone, the system shall delete that connection key and shall not fail the persist', async () => {
    const { api, s3 } = makeHarness({ goneConnectionIds: new Set([BOB_CONN]) });
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    s3.set(connectionKey(bobHash(), BOB_CONN), '{}');
    seedOpeningState(s3, groupHash, GAME_ONE, 3);
    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);
    expectStatus(res, 200);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
    expect(s3.has(connectionKey(bobHash(), BOB_CONN))).toBe(false);
  });

  it('When two clients accept concurrently, the system shall not bind both to the same chair; the late writer shall retry and take the next unbound human seat or 409 if full', async () => {
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
    expect(bobRes.statusCode).toBe(200);
    expect(carolRes.statusCode).toBe(200);
    const stored = JSON.parse(s3.get(inviteKey(token)) ?? '{}') as unknown;
    const hashes = asRecord(stored)['seats'];
    expect(Array.isArray(hashes)).toBe(true);
    const bound = (hashes as unknown[])
      .map((seat) => asRecord(seat)['userHash'])
      .filter((h) => typeof h === 'string');
    expect(new Set(bound).size).toBe(3);
  });

  it('When Start allocates games/NNNNNN, the system shall not overwrite an existing object at that key', async () => {
    const data = new Map<string, string>();
    const store = overlappingGetStore(data, (key) => key.endsWith('/meta.json'));
    const { api, s3 } = makeHarness({ s3: data, store });
    const token1 = await bindAliceAndBob(api);
    const token2 = await createOpenInvite(api, ALICE, TWO_HUMAN_HEURISTIC);
    expectStatus(await postAccept(api, token2, BOB.bearer), 200);
    const groupHash = aliceBobGroupHash();
    store.arm();
    const [a, b] = await Promise.all([
      postStart(api, token1, ALICE.bearer),
      postStart(api, token2, BOB.bearer),
    ]);
    expectStatus(a, 200);
    expectStatus(b, 200);
    const numbers = [parseBody(a), parseBody(b)].map((body) => asRecord(body)['gameNumber']);
    expect(new Set(numbers).size).toBe(2);
    expect(s3.has(gameMetaKey(groupHash, GAME_ONE))).toBe(true);
    expect(s3.has(gameMetaKey(groupHash, GAME_TWO))).toBe(true);
  });

  it('When Start is retried while the invite is still open and that starts game meta already exists, the system shall finish that same start and shall not allocate a new game number', async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const groupHash = aliceBobGroupHash();
    const inviteRaw = s3.get(inviteKey(token));
    expect(inviteRaw).toBeDefined();
    if (inviteRaw === undefined) return;
    s3.set(
      gameMetaKey(groupHash, GAME_ONE),
      JSON.stringify({ seats: asRecord(JSON.parse(inviteRaw) as unknown)['seats'] }),
    );
    const res = expectStatus(await postStart(api, token, ALICE.bearer), 200);
    expect(parseBody(res)).toEqual({ groupHash, gameNumber: GAME_ONE });
    expect(s3.has(gameMetaKey(groupHash, GAME_TWO))).toBe(false);
  });

  it('When Start has completed, the system shall still respond 410 with reason started on GET/accept/start of that token', async () => {
    const { api } = makeHarness();
    const token = await startAliceBob(api);
    for (const call of [
      () => getInvite(api, token),
      () => postStart(api, token, ALICE.bearer),
      () => postAccept(api, token, CAROL.bearer),
    ]) {
      const res = await call();
      expectStatus(res, 410);
      expect(goneReason(parseBody(res))).toBe('started');
    }
  });

  it('Members shall GET a finished game as 200 (version and terminal state)', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    const { winner, version } = seedFinishedState(s3, groupHash, GAME_ONE, 3);
    const res = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expect(versionOf(parseBody(res))).toBe(version);
    expect(winnerOf(stateOfBody(parseBody(res)))).toBe(winner);
  });
});
