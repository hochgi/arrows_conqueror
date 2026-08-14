/**
 * EARS invariants for docs/spec/online-playtest-ux/online-playtest-ux.md.
 *
 * Table-driven in Vitest — this repo has no fast-check
 * (same style as packages/online-api/test/auth-invites.invariants.test.ts).
 */

import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  GAME_ONE,
  aliceBobGroupHash,
  asRecord,
  expectNoSubLeak,
  expectStatus,
  getGame,
  getInvite,
  goneReason,
  makeHarness,
  parseBody,
  postAccept,
  postStart,
  seatSummaries,
  startAliceBob,
  startBobAliceHeuristic,
} from './support';

describe('online-playtest-ux invariants', () => {
  it('When two clients GET the same game, the system shall return the same seat kinds for each chair', async () => {
    const { api } = makeHarness();
    await startBobAliceHeuristic(api);
    const groupHash = aliceBobGroupHash();

    const aliceRes = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);
    const bobRes = await getGame(api, groupHash, GAME_ONE, BOB.bearer);

    expectStatus(aliceRes, 200);
    expectStatus(bobRes, 200);
    const aliceBody = asRecord(parseBody(aliceRes));
    const bobBody = asRecord(parseBody(bobRes));
    expect(aliceBody).toHaveProperty('seats');
    expect(bobBody).toHaveProperty('seats');
    expect(seatSummaries(aliceBody)).toEqual(seatSummaries(bobBody));
    expect(seatSummaries(aliceBody).map((seat) => seat.kind)).toEqual([
      'human',
      'human',
      'heuristic',
    ]);
    expectNoSubLeak(aliceRes, ALICE.sub);
    expectNoSubLeak(bobRes, BOB.sub);
  });

  it('When an invite status is started, GET/accept/start of that token shall be 410 started with groupHash and gameNumber', async () => {
    const { api } = makeHarness();
    const token = await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    const calls: readonly { name: string; run: () => ReturnType<typeof getInvite> }[] = [
      { name: 'GET', run: () => getInvite(api, token) },
      { name: 'accept', run: () => postAccept(api, token, CAROL.bearer) },
      { name: 'start', run: () => postStart(api, token, ALICE.bearer) },
    ];

    for (const call of calls) {
      const res = await call.run();
      expectStatus(res, 410);
      const body = asRecord(parseBody(res));
      expect(goneReason(body), call.name).toBe('started');
      expect(body['groupHash'], call.name).toBe(groupHash);
      expect(body['gameNumber'], call.name).toBe(GAME_ONE);
    }
  });
});
