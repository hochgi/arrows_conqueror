import type { InviteBody, OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import type { GoogleVerifier, ObjectStore, OnlineApiDeps } from './api-types';
import {
  bytesToHex,
  compareStrings,
  groupHashFromUserHashes,
  padGameNumber,
  userHashFromSub,
} from './hashing';
import {
  allHumanSeatsBound,
  asRecord,
  boundHumanHashes,
  indexOfBoundUser,
  nextUnboundHumanIndex,
  parseInvite,
  parseKinds,
  seatsFromPlan,
  serializeInvite,
  validatePlan,
  type InviteRecord,
} from './invite-record';
import {
  conflict,
  forbidden,
  gone,
  jsonResult,
  notFound,
  unauthorized,
  unprocessable,
} from './json-result';
import {
  gameMetaKey,
  gamesPrefix,
  groupMetaKey,
  inviteKey,
  lobbyKey,
  lobbyPrefix,
  userGroupKey,
  userGroupPrefix,
} from './s3-keys';
import { getObject, listObjects, putObject } from './store-io';

const POINTER = '{}';

const authorizationOf = (request: OnlineRequest): string | undefined =>
  request.headers?.authorization;

type UserAuth =
  | { readonly ok: true; readonly userHash: string }
  | { readonly ok: false; readonly result: OnlineHttpResult };

const requireUserHash = async (
  google: GoogleVerifier,
  authorization: string | undefined,
): Promise<UserAuth> => {
  const verified = await Promise.resolve(google.verify(authorization));
  if (!verified.ok) return { ok: false, result: unauthorized() };
  return { ok: true, userHash: userHashFromSub(verified.sub) };
};

const readInvite = async (
  s3: ObjectStore,
  token: string,
): Promise<InviteRecord | undefined> => {
  const raw = await getObject(s3, inviteKey(token));
  if (raw === undefined) return undefined;
  return parseInvite(raw);
};

const writeInvite = async (s3: ObjectStore, token: string, invite: InviteRecord): Promise<void> => {
  await putObject(s3, inviteKey(token), serializeInvite(invite));
};

const writeLobbyPointer = async (
  s3: ObjectStore,
  userHash: string,
  token: string,
): Promise<void> => {
  await putObject(s3, lobbyKey(userHash, token), POINTER);
};

const publicInvite = (token: string, seats: InviteRecord['seats']): InviteBody => ({
  token,
  seats,
});

const closed = (invite: InviteRecord): OnlineHttpResult | undefined => {
  if (invite.status === 'open') return undefined;
  return gone(invite.status);
};

const parseCreateArgs = (
  body: string | undefined,
): { readonly kinds: NonNullable<ReturnType<typeof parseKinds>>; readonly hostSeatIndex?: number } | undefined => {
  if (body === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
  const rec = asRecord(parsed);
  if (rec === undefined) return undefined;
  const seatsRaw = rec['seats'];
  if (!Array.isArray(seatsRaw)) return undefined;
  const kinds = parseKinds(seatsRaw);
  if (kinds === undefined) return undefined;
  if (!Object.hasOwn(rec, 'hostSeatIndex')) {
    return { kinds };
  }
  const host = rec['hostSeatIndex'];
  if (typeof host !== 'number' || !Number.isInteger(host)) return undefined;
  return { kinds, hostSeatIndex: host };
};

export const handleMe = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  return jsonResult(200, { userHash: user.userHash });
};

export const handleCreate = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  const args = parseCreateArgs(request.body);
  if (args === undefined) return unprocessable();
  const plan = validatePlan(args.kinds, args.hostSeatIndex);
  if (plan === undefined) return unprocessable();
  const token = bytesToHex(deps.randomBytes(32));
  const seats = seatsFromPlan(args.kinds, plan.host, user.userHash);
  await writeInvite(deps.s3, token, {
    status: 'open',
    creatorUserHash: user.userHash,
    seats,
  });
  await writeLobbyPointer(deps.s3, user.userHash, token);
  return jsonResult(201, publicInvite(token, seats));
};

export const handleGetInvite = async (
  deps: OnlineApiDeps,
  token: string,
): Promise<OnlineHttpResult> => {
  const invite = await readInvite(deps.s3, token);
  if (invite === undefined) return notFound();
  const closedResult = closed(invite);
  if (closedResult !== undefined) return closedResult;
  return jsonResult(200, publicInvite(token, invite.seats));
};

export const handleAccept = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  token: string,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  const invite = await readInvite(deps.s3, token);
  if (invite === undefined) return notFound();
  const closedResult = closed(invite);
  if (closedResult !== undefined) return closedResult;
  if (indexOfBoundUser(invite.seats, user.userHash) >= 0) {
    await writeLobbyPointer(deps.s3, user.userHash, token);
    return jsonResult(200, publicInvite(token, invite.seats));
  }
  const next = nextUnboundHumanIndex(invite.seats);
  if (next < 0) return conflict();
  const seats = invite.seats.map((seat, index) =>
    index === next ? { kind: 'human' as const, userHash: user.userHash } : seat,
  );
  await writeInvite(deps.s3, token, { ...invite, seats });
  await writeLobbyPointer(deps.s3, user.userHash, token);
  return jsonResult(200, publicInvite(token, seats));
};

export const handleRevoke = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  token: string,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  const invite = await readInvite(deps.s3, token);
  if (invite === undefined) return notFound();
  const closedResult = closed(invite);
  if (closedResult !== undefined) return closedResult;
  if (invite.creatorUserHash !== user.userHash) return forbidden();
  await writeInvite(deps.s3, token, { ...invite, status: 'revoked' });
  return jsonResult(200, {});
};

const readNextGameNumber = async (s3: ObjectStore, groupHash: string): Promise<number> => {
  const raw = await getObject(s3, groupMetaKey(groupHash));
  if (raw === undefined) return 1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return 1;
  }
  const rec = asRecord(parsed);
  const n = rec?.['nextGameNumber'];
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1) return n;
  return 1;
};

const allocateGameNumber = async (s3: ObjectStore, groupHash: string): Promise<string> => {
  let n = await readNextGameNumber(s3, groupHash);
  let padded = padGameNumber(n);
  while ((await getObject(s3, gameMetaKey(groupHash, padded))) !== undefined) {
    n += 1;
    padded = padGameNumber(n);
  }
  return padded;
};

const materialiseGame = async (
  s3: ObjectStore,
  invite: InviteRecord,
): Promise<{ readonly groupHash: string; readonly gameNumber: string }> => {
  const hashes = boundHumanHashes(invite.seats);
  const groupHash = groupHashFromUserHashes(hashes);
  const gameNumber = await allocateGameNumber(s3, groupHash);
  const next = Number.parseInt(gameNumber, 10) + 1;
  await putObject(s3, gameMetaKey(groupHash, gameNumber), JSON.stringify({ seats: invite.seats }));
  await putObject(s3, groupMetaKey(groupHash), JSON.stringify({ nextGameNumber: next }));
  for (const hash of hashes) {
    await putObject(s3, userGroupKey(hash, groupHash), POINTER);
  }
  return { groupHash, gameNumber };
};

export const handleStart = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  token: string,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  const invite = await readInvite(deps.s3, token);
  if (invite === undefined) return notFound();
  const closedResult = closed(invite);
  if (closedResult !== undefined) return closedResult;
  if (indexOfBoundUser(invite.seats, user.userHash) < 0) return forbidden();
  if (!allHumanSeatsBound(invite.seats)) return conflict();
  const started = await materialiseGame(deps.s3, invite);
  await writeInvite(deps.s3, token, { ...invite, status: 'started' });
  return jsonResult(200, started);
};

const lastSegment = (key: string, prefix: string): string | undefined => {
  if (!key.startsWith(prefix)) return undefined;
  const rest = key.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) return undefined;
  return rest;
};

const openLobbyTokens = async (s3: ObjectStore, userHash: string): Promise<readonly { readonly token: string }[]> => {
  const prefix = lobbyPrefix(userHash);
  const keys = [...(await listObjects(s3, prefix))].sort(compareStrings);
  const lobbies: { readonly token: string }[] = [];
  for (const key of keys) {
    const token = lastSegment(key, prefix);
    if (token === undefined) continue;
    const invite = await readInvite(s3, token);
    if (invite?.status === 'open') lobbies.push({ token });
  }
  return lobbies;
};

const GAME_META = /\/games\/(\d{6})\/meta\.json$/;

const startedGames = async (
  s3: ObjectStore,
  userHash: string,
): Promise<readonly { readonly groupHash: string; readonly gameNumber: string }[]> => {
  const prefix = userGroupPrefix(userHash);
  const groupKeys = [...(await listObjects(s3, prefix))].sort(compareStrings);
  const games: { readonly groupHash: string; readonly gameNumber: string }[] = [];
  for (const key of groupKeys) {
    const groupHash = lastSegment(key, prefix);
    if (groupHash === undefined) continue;
    const gameKeys = [...(await listObjects(s3, gamesPrefix(groupHash)))].sort(compareStrings);
    for (const gameKey of gameKeys) {
      const match = GAME_META.exec(gameKey);
      const gameNumber = match?.[1];
      if (gameNumber !== undefined) games.push({ groupHash, gameNumber });
    }
  }
  return games;
};

export const handleMyGames = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
): Promise<OnlineHttpResult> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user.result;
  const lobbies = await openLobbyTokens(deps.s3, user.userHash);
  const games = await startedGames(deps.s3, user.userHash);
  return jsonResult(200, { lobbies, games });
};
