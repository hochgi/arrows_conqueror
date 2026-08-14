/**
 * docs/spec/online-playtest-ux/online-playtest-ux.core.feature — API scenarios.
 *
 * @see docs/spec/online-playtest-ux/online-playtest-ux.md
 */

import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  GAME_ONE,
  aliceBobGroupHash,
  aliceHash,
  asRecord,
  bobHash,
  expectNoSubLeak,
  expectStatus,
  getGame,
  makeHarness,
  parseBody,
  seatSummaries,
  startBobAliceHeuristic,
} from './support';

describe('Game GET carries seats', () => {
  it('GET game includes meta seats', async () => {
    const { api } = makeHarness();
    await startBobAliceHeuristic(api);
    const groupHash = aliceBobGroupHash();

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    const body = asRecord(parseBody(res));
    expect(body).toHaveProperty('seats');
    expect(seatSummaries(body)).toEqual([
      { kind: 'human', userHash: bobHash() },
      { kind: 'human', userHash: aliceHash() },
      { kind: 'heuristic' },
    ]);
    expectNoSubLeak(res, ALICE.sub);
    expectNoSubLeak(res, BOB.sub);
  });
});
