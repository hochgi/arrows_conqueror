/**
 * docs/spec/online-playtest-ux/online-playtest-ux.edge-cases.feature — adapter/host boundaries.
 *
 * @see docs/spec/online-playtest-ux/online-playtest-ux.md
 */

import { describe, expect, it } from 'vitest';
import type { ArrowId, GameState, Group } from '@conquarrow/contracts';
import { endTurn } from '@conquarrow/contracts';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import { passIfExhausted } from '../src/autoEndTurn';
import { isCallerToMove } from '../src/online-pages';
import {
  ALICE,
  BOB,
  INVITE_TOKEN,
  TWO_HUMAN_HEURISTIC,
  aliceBobSeats,
  aliceHostSeats,
  apiCalled,
  apiCalls,
  createInviteScript,
  goneInviteStartedScript,
  inviteHash,
  makeHostHarness,
  peekInviteScript,
} from './online-shell.support';

describe('410 bodies', () => {
  it('Started 410 without ids still blocks accept', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: inviteHash(INVITE_TOKEN),
      fetchScript: [goneInviteStartedScript(INVITE_TOKEN)],
    });

    await h.host.boot();

    expect(h.host.acceptOffered()).toBe(false);
    await h.host.acceptInvite();
    expect(apiCalls(h, 'POST', `/invites/${INVITE_TOKEN}/accept`)).toHaveLength(0);
  });
});

describe('Frozen roster', () => {
  it('Live invite does not offer seat-kind edits', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [createInviteScript(INVITE_TOKEN)],
    });
    await h.host.boot();
    h.host.selectMode('online');
    h.host.setSeatPlan(TWO_HUMAN_HEURISTIC);

    await h.host.createInvite();

    expect(h.host.adapter().inviteToken()).toBe(INVITE_TOKEN);
    expect(h.host.inviteGone()).toBe(false);
    expect(h.host.seatEditsOffered()).toBe(false);
  });
});

describe('Exhausted online turn', () => {
  it('isCallerToMove is false when another human is active', () => {
    const seats = aliceBobSeats();
    const players = ['A', 'B', 'C'];
    expect(isCallerToMove(seats, ALICE.userHash, players, 'A')).toBe(true);
    expect(isCallerToMove(seats, ALICE.userHash, players, 'B')).toBe(false);
    expect(isCallerToMove(seats, BOB.userHash, players, 'B')).toBe(true);
  });
});

describe('Visibility and Local', () => {
  it('Becoming visible peeks a held invite', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: inviteHash(INVITE_TOKEN),
      fetchScript: [
        peekInviteScript(INVITE_TOKEN, aliceHostSeats()),
        peekInviteScript(INVITE_TOKEN, aliceHostSeats()),
      ],
    });
    await h.host.boot();
    expect(apiCalls(h, 'GET', `/invites/${INVITE_TOKEN}`)).toHaveLength(1);

    await h.host.handleVisibility(true);

    expect(apiCalls(h, 'GET', `/invites/${INVITE_TOKEN}`)).toHaveLength(2);
  });

  it('Local exhausted turn still does not fetch', async () => {
    const rules = makeRules(makeTiling());
    const opening = makeMatch();
    const A = opening.players[0];
    if (A === undefined) throw new Error('setup: makeMatch has no players');
    const from = [...opening.groups.entries()].find(([, g]) => g.owner === A)?.[0];
    if (from === undefined) throw new Error('setup: opening has no group for A');
    const state: GameState = {
      ...opening,
      activePlayer: A,
      groups: new Map<ArrowId, Group>([
        [from, { owner: A, heads: 1, spent: 1 }],
        ...[...opening.groups.entries()].filter(([, g]) => g.owner !== A),
      ]),
    };
    const h = makeHostHarness();
    await h.host.boot();
    h.host.selectMode('local');

    const { state: next, moves } = passIfExhausted(rules, state);

    expect(moves).toEqual([endTurn()]);
    expect(next.activePlayer).not.toBe(state.activePlayer);
    expect(apiCalled(h)).toBe(false);
  });
});
