/**
 * docs/spec/online-auth-invites/online-auth-invites.core.feature — one test per scenario.
 *
 * @see docs/spec/online-auth-invites/online-auth-invites.md
 */

import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  GAME_ONE,
  TWO_HUMAN_HEURISTIC,
  aliceBobGroupHash,
  aliceHash,
  bindAliceAndBob,
  bobHash,
  createOpenInvite,
  expectNoSubLeak,
  expectStatus,
  gameMetaKey,
  getInvite,
  getMe,
  getMyGames,
  groupAndGameKeys,
  inviteKey,
  lobbyKey,
  makeHarness,
  myGamesOf,
  parseBody,
  playLogKeys,
  postAccept,
  postInvites,
  postStart,
  seatSummaries,
  tokenOf,
  userHashOf,
} from './support';

describe('Identity', () => {
  it('GET /me returns userHash for a valid bearer', async () => {
    const { api } = makeHarness();
    const res = await getMe(api, ALICE.bearer);

    expectStatus(res, 200);
    expect(parseBody(res)).toEqual({ userHash: userHashOf(ALICE.sub) });
    expectNoSubLeak(res, ALICE.sub);
  });
});

describe('Create and peek', () => {
  it('Creator opens a 3-seat lobby with two humans', async () => {
    const { api, s3 } = makeHarness();
    const res = await postInvites(api, ALICE.bearer, { seats: TWO_HUMAN_HEURISTIC });

    expectStatus(res, 201);
    const body = parseBody(res);
    const token = tokenOf(body);
    expect(seatSummaries(body)).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human' },
      { kind: 'heuristic' },
    ]);
    expect(s3.has(inviteKey(token))).toBe(true);
    expect(s3.has(lobbyKey(aliceHash(), token))).toBe(true);
    expect(groupAndGameKeys(s3)).toEqual([]);
    expectNoSubLeak(res, ALICE.sub);
  });

  it('Unauthenticated GET shows an open invite', async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    const res = await getInvite(api, token);

    expectStatus(res, 200);
    expect(seatSummaries(parseBody(res))).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human' },
      { kind: 'heuristic' },
    ]);
    expectNoSubLeak(res, ALICE.sub);
  });
});

describe('Accept and Start', () => {
  it('Second human accepts the next unbound chair', async () => {
    const { api, s3 } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    const res = await postAccept(api, token, BOB.bearer);

    expectStatus(res, 200);
    expect(seatSummaries(parseBody(res))).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human', userHash: bobHash() },
      { kind: 'heuristic' },
    ]);
    expect(s3.has(lobbyKey(bobHash(), token))).toBe(true);
    expectNoSubLeak(res, BOB.sub);
  });

  it("Open lobby appears on the seated users' /my-games", async () => {
    const { api } = makeHarness();
    const token = await bindAliceAndBob(api);

    const forAlice = expectStatus(await getMyGames(api, ALICE.bearer), 200);
    expect(myGamesOf(parseBody(forAlice)).lobbies).toContain(token);

    const forBob = expectStatus(await getMyGames(api, BOB.bearer), 200);
    expect(myGamesOf(parseBody(forBob)).lobbies).toContain(token);
  });

  it('Start materialises group and game meta for both humans', async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const groupHash = aliceBobGroupHash();
    const res = await postStart(api, token, ALICE.bearer);

    expectStatus(res, 200);
    expect(parseBody(res)).toEqual({ groupHash, gameNumber: GAME_ONE });
    expect(s3.has(gameMetaKey(groupHash, GAME_ONE))).toBe(true);
    const metaRaw = s3.get(gameMetaKey(groupHash, GAME_ONE));
    expect(metaRaw).toBeDefined();
    if (metaRaw === undefined) return;
    expect(seatSummaries(JSON.parse(metaRaw) as unknown)).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human', userHash: bobHash() },
      { kind: 'heuristic' },
    ]);
    expect(playLogKeys(s3)).toEqual([]);

    const forAlice = expectStatus(await getMyGames(api, ALICE.bearer), 200);
    const aliceLib = myGamesOf(parseBody(forAlice));
    expect(aliceLib.games).toContainEqual({ groupHash, gameNumber: GAME_ONE });
    expect(aliceLib.lobbies).not.toContain(token);

    const forBob = expectStatus(await getMyGames(api, BOB.bearer), 200);
    const bobLib = myGamesOf(parseBody(forBob));
    expect(bobLib.games).toContainEqual({ groupHash, gameNumber: GAME_ONE });
    expect(bobLib.lobbies).not.toContain(token);
  });
});
