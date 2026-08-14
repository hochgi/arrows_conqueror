/**
 * Test doubles and HTTP helpers for the P17 online-auth-invites suite.
 *
 * Expected hashes are computed here with `node:crypto` so assertions do not
 * import production hashing. Production hashing lives in `src/hashing.ts`.
 */

import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import type {
  CreateInviteBody,
  OnlineHeaders,
  OnlineHttpResult,
  OnlinePort,
  PlannedSeatKind,
} from '@conquarrow/contracts';
import { createOnlineApi } from '../src/create-online-api';
import type { GoogleVerifier, ObjectStore } from '../src/create-online-api';

export const GAME_ONE = '000001';
export const GAME_TWO = '000002';

export const TWO_HUMAN_HEURISTIC: readonly PlannedSeatKind[] = [
  'human',
  'human',
  'heuristic',
];

export const SIX_HUMAN: readonly PlannedSeatKind[] = [
  'human',
  'human',
  'human',
  'human',
  'human',
  'human',
];

export interface TestUser {
  readonly bearer: string;
  readonly sub: string;
}

export const ALICE: TestUser = { bearer: 'alice-token', sub: 'alice-sub' };
export const BOB: TestUser = { bearer: 'bob-token', sub: 'bob-sub' };
export const CAROL: TestUser = { bearer: 'carol-token', sub: 'carol-sub' };
export const DAVE: TestUser = { bearer: 'dave-token', sub: 'dave-sub' };
export const ED: TestUser = { bearer: 'ed-token', sub: 'ed-sub' };
export const FAY: TestUser = { bearer: 'fay-token', sub: 'fay-sub' };
export const GINA: TestUser = { bearer: 'gina-token', sub: 'gina-sub' };

export const EXPIRED_BEARER = 'expired-token';
export const INVALID_BEARER = 'invalid-token';

const KNOWN_USERS: readonly TestUser[] = [ALICE, BOB, CAROL, DAVE, ED, FAY, GINA];

/** First 16 bytes of SHA-256, lowercase hex (32 characters). */
export const truncate16Sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);

export const userHashOf = (sub: string): string => truncate16Sha256(sub);

export const groupHashOfUserHashes = (userHashes: readonly string[]): string => {
  const sorted = [...userHashes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return truncate16Sha256(sorted.join('\n'));
};

export const aliceHash = (): string => userHashOf(ALICE.sub);
export const bobHash = (): string => userHashOf(BOB.sub);
export const aliceBobGroupHash = (): string =>
  groupHashOfUserHashes([aliceHash(), bobHash()]);

export const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const sequentialBytes = (): ((size: number) => Uint8Array) => {
  let n = 0;
  return (size: number): Uint8Array => {
    n += 1;
    const bytes = new Uint8Array(size);
    if (bytes.length > 0) {
      bytes[0] = n & 0xff;
    }
    return bytes;
  };
};

export const fixedBytes =
  (bytes: Uint8Array): ((size: number) => Uint8Array) =>
  (size: number): Uint8Array => {
    const out = new Uint8Array(size);
    out.set(bytes.subarray(0, size));
    return out;
  };

export const fakeGoogle = (): GoogleVerifier => ({
  verify: (authorizationHeader) => {
    if (authorizationHeader === undefined || authorizationHeader === '') {
      return { ok: false, reason: 'missing' };
    }
    const match = /^Bearer\s+(\S+)$/.exec(authorizationHeader);
    const token = match?.[1];
    if (token === undefined) {
      return { ok: false, reason: 'invalid' };
    }
    if (token === EXPIRED_BEARER) {
      return { ok: false, reason: 'expired' };
    }
    if (token === INVALID_BEARER) {
      return { ok: false, reason: 'invalid' };
    }
    const user = KNOWN_USERS.find((u) => u.bearer === token);
    if (user === undefined) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, sub: user.sub };
  },
});

export const mapStore = (data: Map<string, string>): ObjectStore => ({
  get: (key) => data.get(key),
  put: (key, body) => {
    data.set(key, body);
  },
  listPrefix: (prefix) =>
    [...data.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
});

export const makeHarness = (overrides?: {
  readonly randomBytes?: (size: number) => Uint8Array;
  readonly clock?: () => number;
}): { api: OnlinePort; s3: Map<string, string> } => {
  const s3 = new Map<string, string>();
  const api = createOnlineApi({
    google: fakeGoogle(),
    s3: mapStore(s3),
    clock: overrides?.clock ?? ((): number => 0),
    randomBytes: overrides?.randomBytes ?? sequentialBytes(),
  });
  return { api, s3 };
};

const authHeaders = (bearer: string): OnlineHeaders => ({
  authorization: `Bearer ${bearer}`,
});

export const getMe = (api: OnlinePort, bearer?: string): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'GET',
    path: '/me',
    ...(bearer === undefined ? {} : { headers: authHeaders(bearer) }),
  });

export const getMyGames = (
  api: OnlinePort,
  bearer?: string,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'GET',
    path: '/my-games',
    ...(bearer === undefined ? {} : { headers: authHeaders(bearer) }),
  });

export const getInvite = (
  api: OnlinePort,
  token: string,
  bearer?: string,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'GET',
    path: `/invites/${token}`,
    ...(bearer === undefined ? {} : { headers: authHeaders(bearer) }),
  });

export const postJson = (
  api: OnlinePort,
  path: string,
  bearer: string | undefined,
  body?: unknown,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'POST',
    path,
    ...(bearer === undefined ? {} : { headers: authHeaders(bearer) }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const postInvites = (
  api: OnlinePort,
  bearer: string,
  body: CreateInviteBody,
): Promise<OnlineHttpResult> => postJson(api, '/invites', bearer, body);

export const postAccept = (
  api: OnlinePort,
  token: string,
  bearer: string | undefined,
): Promise<OnlineHttpResult> => postJson(api, `/invites/${token}/accept`, bearer);

export const postRevoke = (
  api: OnlinePort,
  token: string,
  bearer: string,
): Promise<OnlineHttpResult> => postJson(api, `/invites/${token}/revoke`, bearer);

export const postStart = (
  api: OnlinePort,
  token: string,
  bearer: string,
): Promise<OnlineHttpResult> => postJson(api, `/invites/${token}/start`, bearer);

export const parseBody = (res: OnlineHttpResult): unknown =>
  JSON.parse(res.body) as unknown;

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`expected a JSON object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
};

export const tokenOf = (value: unknown): string => {
  const token = asRecord(value)['token'];
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('expected body.token to be a non-empty string');
  }
  return token;
};

export const seatsOf = (value: unknown): readonly Record<string, unknown>[] => {
  const seats = asRecord(value)['seats'];
  if (!Array.isArray(seats)) {
    throw new Error('expected body.seats to be an array');
  }
  return seats.map((seat, i) => {
    if (typeof seat !== 'object' || seat === null || Array.isArray(seat)) {
      throw new Error(`expected seats[${String(i)}] to be an object`);
    }
    return seat as Record<string, unknown>;
  });
};

export type SeatSummary =
  | { readonly kind: 'human'; readonly userHash: string }
  | { readonly kind: 'human' }
  | { readonly kind: 'heuristic' };

export const boundUserHash = (seat: SeatSummary): string | undefined =>
  seat.kind === 'human' && 'userHash' in seat ? seat.userHash : undefined;

export const seatSummaries = (value: unknown): readonly SeatSummary[] =>
  seatsOf(value).map((seat, i) => {
    const kind = seat['kind'];
    if (kind === 'heuristic') {
      return { kind: 'heuristic' };
    }
    if (kind !== 'human') {
      throw new Error(`expected seats[${String(i)}].kind human|heuristic`);
    }
    const userHash = seat['userHash'];
    if (typeof userHash === 'string') {
      return { kind: 'human', userHash };
    }
    return { kind: 'human' };
  });

export const myGamesOf = (
  value: unknown,
): {
  readonly lobbies: readonly string[];
  readonly games: readonly { groupHash: string; gameNumber: string }[];
} => {
  const rec = asRecord(value);
  const lobbiesRaw = rec['lobbies'];
  const gamesRaw = rec['games'];
  if (!Array.isArray(lobbiesRaw) || !Array.isArray(gamesRaw)) {
    throw new Error('expected body.lobbies and body.games to be arrays');
  }
  const lobbies = lobbiesRaw.map((row, i) => {
    const token = asRecord(row)['token'];
    if (typeof token !== 'string') {
      throw new Error(`expected lobbies[${String(i)}].token`);
    }
    return token;
  });
  const games = gamesRaw.map((row, i) => {
    const recRow = asRecord(row);
    const groupHash = recRow['groupHash'];
    const gameNumber = recRow['gameNumber'];
    if (typeof groupHash !== 'string' || typeof gameNumber !== 'string') {
      throw new Error(`expected games[${String(i)}] groupHash and gameNumber strings`);
    }
    return { groupHash, gameNumber };
  });
  return { lobbies, games };
};

export const goneReason = (value: unknown): string => {
  const reason = asRecord(value)['reason'];
  if (typeof reason !== 'string') {
    throw new Error('expected body.reason to be a string');
  }
  return reason;
};

export const expectStatus = (
  res: OnlineHttpResult,
  status: number,
): OnlineHttpResult => {
  expect(res.statusCode).toBe(status);
  return res;
};

export const expectNoSubLeak = (res: OnlineHttpResult, sub: string): void => {
  expect(res.body).not.toContain(sub);
  const parsed: unknown = parseBody(res);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    expect(parsed).not.toHaveProperty('sub');
  }
};

export const inviteKey = (token: string): string =>
  `conquarrow/invites/${token}.json`;

export const lobbyKey = (userHash: string, token: string): string =>
  `conquarrow/users/${userHash}/lobbies/${token}`;

export const userGroupKey = (userHash: string, groupHash: string): string =>
  `conquarrow/users/${userHash}/groups/${groupHash}`;

export const groupMetaKey = (groupHash: string): string =>
  `conquarrow/groups/${groupHash}/meta.json`;

export const gameMetaKey = (groupHash: string, gameNumber: string): string =>
  `conquarrow/groups/${groupHash}/games/${gameNumber}/meta.json`;

export const groupAndGameKeys = (s3: ReadonlyMap<string, string>): readonly string[] =>
  [...s3.keys()]
    .filter((key) => key.includes('/groups/') || key.includes('/games/'))
    .sort();

export const playLogKeys = (s3: ReadonlyMap<string, string>): readonly string[] =>
  [...s3.keys()]
    .filter((key) => key.endsWith('/state.json') || key.endsWith('/log.jsonl'))
    .sort();

export const createOpenInvite = async (
  api: OnlinePort,
  creator: TestUser,
  seats: readonly PlannedSeatKind[] = TWO_HUMAN_HEURISTIC,
  hostSeatIndex?: number,
): Promise<string> => {
  const body: CreateInviteBody =
    hostSeatIndex === undefined ? { seats } : { seats, hostSeatIndex };
  const res = await postInvites(api, creator.bearer, body);
  expectStatus(res, 201);
  return tokenOf(parseBody(res));
};

export const bindAliceAndBob = async (api: OnlinePort): Promise<string> => {
  const token = await createOpenInvite(api, ALICE);
  expectStatus(await postAccept(api, token, BOB.bearer), 200);
  return token;
};

export const bindSixHumans = async (api: OnlinePort): Promise<string> => {
  const token = await createOpenInvite(api, ALICE, SIX_HUMAN);
  for (const user of [BOB, CAROL, DAVE, ED, FAY]) {
    expectStatus(await postAccept(api, token, user.bearer), 200);
  }
  return token;
};

export const startAliceBob = async (api: OnlinePort): Promise<string> => {
  const token = await bindAliceAndBob(api);
  expectStatus(await postStart(api, token, ALICE.bearer), 200);
  return token;
};
