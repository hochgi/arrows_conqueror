/**
 * docs/spec/online-auth-invites/online-auth-invites.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/online-auth-invites/online-auth-invites.md
 */

import { describe, expect, it } from 'vitest';
import type { PlannedSeatKind } from '@conquarrow/contracts';
import {
  ALICE,
  BOB,
  CAROL,
  EXPIRED_BEARER,
  GAME_ONE,
  GINA,
  TWO_HUMAN_HEURISTIC,
  aliceBobGroupHash,
  aliceHash,
  bindAliceAndBob,
  bindSixHumans,
  bobHash,
  boundUserHash,
  createOpenInvite,
  expectStatus,
  gameMetaKey,
  getInvite,
  getMe,
  getMyGames,
  goneReason,
  groupAndGameKeys,
  makeHarness,
  myGamesOf,
  parseBody,
  postAccept,
  postInvites,
  postRevoke,
  postStart,
  seatSummaries,
  startAliceBob,
  userHashOf,
} from './support';

describe('Seat plan must be an online lobby', () => {
  it('All-heuristic create is 422 and writes nothing', async () => {
    await expectCreateWritesNothing(['heuristic', 'heuristic', 'heuristic']);
  });

  it('One human and two heuristics is 422 and writes nothing', async () => {
    await expectCreateWritesNothing(['human', 'heuristic', 'heuristic']);
  });

  it('BYOK seat is 422 and writes nothing', async () => {
    await expectCreateWritesNothing(['human', 'human', 'byok']);
  });

  it('Seat count other than 3 or 6 is 422', async () => {
    await expectCreateWritesNothing(['human', 'human', 'human', 'human']);
  });

  it('hostSeatIndex on a heuristic chair is 422', async () => {
    const { api, s3 } = makeHarness();
    const before = new Map(s3);
    const res = await postInvites(api, ALICE.bearer, {
      seats: TWO_HUMAN_HEURISTIC,
      hostSeatIndex: 2,
    });
    expectStatus(res, 422);
    expect(s3).toEqual(before);
  });
});

describe('Creator chair', () => {
  it('hostSeatIndex binds the creator to a later human seat', async () => {
    const { api } = makeHarness();
    const res = await postInvites(api, ALICE.bearer, {
      seats: ['human', 'heuristic', 'human'],
      hostSeatIndex: 2,
    });

    expectStatus(res, 201);
    expect(seatSummaries(parseBody(res))).toEqual([
      { kind: 'human' },
      { kind: 'heuristic' },
      { kind: 'human', userHash: aliceHash() },
    ]);
  });
});

describe('Accept', () => {
  it('Same user accepting twice stays on one seat', async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    expectStatus(await postAccept(api, token, BOB.bearer), 200);
    const again = await postAccept(api, token, BOB.bearer);

    expectStatus(again, 200);
    const seats = seatSummaries(parseBody(again));
    const bobChairs = seats.filter((s) => boundUserHash(s) === bobHash());
    expect(bobChairs).toHaveLength(1);
    expect(seats[1]).toEqual({ kind: 'human', userHash: bobHash() });
  });

  it('Unauthenticated accept is 401', async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    const before = seatSummaries(parseBody(expectStatus(await getInvite(api, token), 200)));
    const res = await postAccept(api, token, undefined);

    expectStatus(res, 401);
    expect(seatSummaries(parseBody(expectStatus(await getInvite(api, token), 200)))).toEqual(
      before,
    );
  });

  it('Sixth human on a full 6-human lobby is 409', async () => {
    const { api } = makeHarness();
    const token = await bindSixHumans(api);
    const res = await postAccept(api, token, GINA.bearer);

    expectStatus(res, 409);
    const peek = expectStatus(await getInvite(api, token), 200);
    const body = parseBody(peek);
    expect(seatSummaries(body)).toHaveLength(6);
    expect(asRecordOrEmpty(body)['spectators']).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(userHashOf(GINA.sub));
  });

  it('Missing or expired Google token is 401 on /me', async () => {
    const { api } = makeHarness();
    expectStatus(await getMe(api), 401);
    expectStatus(await getMe(api, EXPIRED_BEARER), 401);
  });
});

describe('Revoke and Start', () => {
  it('Creator revoke yields 410 revoked', async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    expectStatus(await postRevoke(api, token, ALICE.bearer), 200);

    const peek = await getInvite(api, token);
    expectStatus(peek, 410);
    expect(goneReason(parseBody(peek))).toBe('revoked');

    const accept = await postAccept(api, token, BOB.bearer);
    expectStatus(accept, 410);
    expect(goneReason(parseBody(accept))).toBe('revoked');
  });

  it('Non-creator cannot revoke', async () => {
    const { api } = makeHarness();
    const token = await bindAliceAndBob(api);
    const res = await postRevoke(api, token, BOB.bearer);

    expectStatus(res, 403);
    expectStatus(await getInvite(api, token), 200);
  });

  it('Start before humans are full is 409', async () => {
    const { api, s3 } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    const res = await postStart(api, token, ALICE.bearer);

    expectStatus(res, 409);
    expect(groupAndGameKeys(s3)).toEqual([]);
  });

  it('Unbound user cannot Start', async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const res = await postStart(api, token, CAROL.bearer);

    expectStatus(res, 403);
    expect(groupAndGameKeys(s3)).toEqual([]);
  });

  it('After Start the token is 410 started', async () => {
    const { api } = makeHarness();
    const token = await startAliceBob(api);

    const peek = await getInvite(api, token);
    expectStatus(peek, 410);
    expect(goneReason(parseBody(peek))).toBe('started');

    const accept = await postAccept(api, token, CAROL.bearer);
    expectStatus(accept, 410);
    expect(goneReason(parseBody(accept))).toBe('started');

    const startAgain = await postStart(api, token, ALICE.bearer);
    expectStatus(startAgain, 410);
    expect(goneReason(parseBody(startAgain))).toBe('started');
  });

  it('B may Start when every human seat is bound', async () => {
    const { api, s3 } = makeHarness();
    const token = await bindAliceAndBob(api);
    const res = await postStart(api, token, BOB.bearer);

    expectStatus(res, 200);
    expect(s3.has(gameMetaKey(aliceBobGroupHash(), GAME_ONE))).toBe(true);
  });
});

describe('Library isolation', () => {
  it("/my-games does not list another user's lobby", async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    const res = await getMyGames(api, BOB.bearer);

    expectStatus(res, 200);
    const lib = myGamesOf(parseBody(res));
    expect(lib.lobbies).not.toContain(token);
    expect(res.body).not.toContain(aliceHash());
  });
});

const expectCreateWritesNothing = async (
  seats: readonly PlannedSeatKind[],
): Promise<void> => {
  const { api, s3 } = makeHarness();
  const before = new Map(s3);
  const res = await postInvites(api, ALICE.bearer, { seats });
  expectStatus(res, 422);
  expect(s3).toEqual(before);
};

const asRecordOrEmpty = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};
