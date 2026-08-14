/**
 * docs/spec/online-playtest-ux/online-playtest-ux.edge-cases.feature — API 410 bodies.
 *
 * @see docs/spec/online-playtest-ux/online-playtest-ux.md
 */

import { describe, expect, it } from 'vitest';
import {
  ALICE,
  asRecord,
  createOpenInvite,
  expectStatus,
  getInvite,
  goneReason,
  makeHarness,
  parseBody,
  postRevoke,
} from './support';

describe('410 bodies', () => {
  it('Revoke 410 has no game ids', async () => {
    const { api } = makeHarness();
    const token = await createOpenInvite(api, ALICE);
    expectStatus(await postRevoke(api, token, ALICE.bearer), 200);

    const res = await getInvite(api, token);

    expectStatus(res, 410);
    const body = asRecord(parseBody(res));
    expect(goneReason(body)).toBe('revoked');
    expect(body).not.toHaveProperty('groupHash');
    expect(body).not.toHaveProperty('gameNumber');
  });
});
