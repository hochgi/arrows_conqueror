/**
 * Lobby replay: ordered HTTP calls create → accept → start → /my-games
 * reproduce exact groupHash + game 000001 meta.
 *
 * Not a rules-core turn-flow replay. Injected CSPRNG makes the invite token
 * deterministic; expected groupHash is computed in the test, not a golden file.
 *
 * @see docs/spec/online-auth-invites/online-auth-invites.md
 */

import { describe, expect, it } from 'vitest';
import type { OnlineRequest } from '@conquarrow/contracts';
import {
  ALICE,
  BOB,
  GAME_ONE,
  TWO_HUMAN_HEURISTIC,
  aliceBobGroupHash,
  aliceHash,
  bytesToHex,
  bobHash,
  expectStatus,
  fixedBytes,
  gameMetaKey,
  getMyGames,
  makeHarness,
  myGamesOf,
  parseBody,
  playLogKeys,
  seatSummaries,
  tokenOf,
  userGroupKey,
} from './support';

const INVITE_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i);
const TOKEN = bytesToHex(INVITE_BYTES);

const CREATE: OnlineRequest = {
  method: 'POST',
  path: '/invites',
  headers: { authorization: `Bearer ${ALICE.bearer}` },
  body: JSON.stringify({ seats: TWO_HUMAN_HEURISTIC }),
};

const ACCEPT: OnlineRequest = {
  method: 'POST',
  path: `/invites/${TOKEN}/accept`,
  headers: { authorization: `Bearer ${BOB.bearer}` },
};

const START: OnlineRequest = {
  method: 'POST',
  path: `/invites/${TOKEN}/start`,
  headers: { authorization: `Bearer ${ALICE.bearer}` },
};

describe('a recorded lobby replay reproduces groupHash 000001 meta', () => {
  it('create → accept → start → /my-games yields game 000001 under the sorted-hash group', async () => {
    const { api, s3 } = makeHarness({ randomBytes: fixedBytes(INVITE_BYTES) });
    const groupHash = aliceBobGroupHash();

    const created = expectStatus(await api.handle(CREATE), 201);
    const createdBody = parseBody(created);
    expect(tokenOf(createdBody)).toBe(TOKEN);
    expect(seatSummaries(createdBody)).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human' },
      { kind: 'heuristic' },
    ]);

    const accepted = expectStatus(await api.handle(ACCEPT), 200);
    expect(seatSummaries(parseBody(accepted))).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human', userHash: bobHash() },
      { kind: 'heuristic' },
    ]);

    const started = expectStatus(await api.handle(START), 200);
    expect(parseBody(started)).toEqual({ groupHash, gameNumber: GAME_ONE });

    const metaKey = gameMetaKey(groupHash, GAME_ONE);
    expect(s3.has(metaKey)).toBe(true);
    const metaRaw = s3.get(metaKey);
    expect(metaRaw).toBeDefined();
    if (metaRaw === undefined) return;
    expect(seatSummaries(JSON.parse(metaRaw) as unknown)).toEqual([
      { kind: 'human', userHash: aliceHash() },
      { kind: 'human', userHash: bobHash() },
      { kind: 'heuristic' },
    ]);
    expect(s3.has(userGroupKey(aliceHash(), groupHash))).toBe(true);
    expect(s3.has(userGroupKey(bobHash(), groupHash))).toBe(true);
    expect(playLogKeys(s3)).toEqual([]);

    const aliceLib = myGamesOf(parseBody(expectStatus(await getMyGames(api, ALICE.bearer), 200)));
    expect(aliceLib.games).toEqual([{ groupHash, gameNumber: GAME_ONE }]);
    expect(aliceLib.lobbies).not.toContain(TOKEN);

    const bobLib = myGamesOf(parseBody(expectStatus(await getMyGames(api, BOB.bearer), 200)));
    expect(bobLib.games).toEqual([{ groupHash, gameNumber: GAME_ONE }]);
    expect(bobLib.lobbies).not.toContain(TOKEN);
  });
});
