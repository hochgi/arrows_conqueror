/**
 * Turn-flow replay: start → ensure GET → human endTurn → GET.
 * makeMatch + fold log.jsonl equals the GET position.
 *
 * @see docs/spec/online-moves-ws/online-moves-ws.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn } from '@conquarrow/contracts';
import {
  ALICE,
  GAME_ONE,
  aliceBobGroupHash,
  expectStatus,
  foldLog,
  gameLogKey,
  getGame,
  makeHarness,
  parseBody,
  parseLogJsonl,
  postMove,
  snapshotState,
  startAliceBob,
  stateOfBody,
  versionOf,
} from './support';

describe('a recorded online match replay reproduces GET state', () => {
  it('start → ensure GET → human endTurn → GET equals makeMatch folded with log.jsonl', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();

    const ensured = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expect(versionOf(parseBody(ensured))).toBe(0);

    const posted = expectStatus(
      await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0),
      200,
    );
    expect(versionOf(parseBody(posted))).toBe(1);

    const got = expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expect(versionOf(parseBody(got))).toBe(1);

    const moves = parseLogJsonl(s3.get(gameLogKey(groupHash, GAME_ONE)));
    const folded = foldLog(3, moves);
    expect(stateOfBody(parseBody(got))).toEqual(snapshotState(folded));
  });
});
