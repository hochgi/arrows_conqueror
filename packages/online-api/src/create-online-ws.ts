/**
 * In-process WebSocket port: verify Google ID token on `$connect`, register
 * `connections/<userHash>/<connectionId>`, delete on `$disconnect`.
 *
 * @see docs/spec/online-moves-ws/online-moves-ws.md
 */

import type { OnlineWsPort, WsConnectRequest, WsDisconnectRequest } from '@conquarrow/contracts';
import type { ObjectStore, OnlineApiDeps } from './api-types';
import { userHashFromSub } from './hashing';
import { asRecord } from './invite-record';
import { connectionIdKey, connectionKey } from './s3-keys';
import { deleteObject, getObject, putObject } from './store-io';

const POINTER = '{}';

const forgetConnection = async (
  s3: ObjectStore,
  userHash: string,
  connectionId: string,
): Promise<void> => {
  await deleteObject(s3, connectionKey(userHash, connectionId));
  await deleteObject(s3, connectionIdKey(connectionId));
};

const userHashOfConnection = async (
  s3: ObjectStore,
  connectionId: string,
): Promise<string | undefined> => {
  const raw = await getObject(s3, connectionIdKey(connectionId));
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const hash = asRecord(parsed)?.['userHash'];
  return typeof hash === 'string' ? hash : undefined;
};

const connect = async (
  deps: OnlineApiDeps,
  request: WsConnectRequest,
): Promise<{ readonly statusCode: number }> => {
  const token = request.accessToken;
  if (token === undefined || token === '') return { statusCode: 401 };
  const verified = await Promise.resolve(deps.google.verify(`Bearer ${token}`));
  if (!verified.ok) return { statusCode: 401 };
  const userHash = userHashFromSub(verified.sub);
  await putObject(deps.s3, connectionIdKey(request.connectionId), JSON.stringify({ userHash }));
  await putObject(deps.s3, connectionKey(userHash, request.connectionId), POINTER);
  return { statusCode: 200 };
};

const disconnect = async (
  deps: OnlineApiDeps,
  request: WsDisconnectRequest,
): Promise<{ readonly statusCode: number }> => {
  const userHash =
    request.userHash ?? (await userHashOfConnection(deps.s3, request.connectionId));
  if (userHash !== undefined) {
    await forgetConnection(deps.s3, userHash, request.connectionId);
  }
  return { statusCode: 200 };
};

export const createOnlineWs = (deps: OnlineApiDeps): OnlineWsPort => ({
  connect: (request) => connect(deps, request),
  disconnect: (request) => disconnect(deps, request),
});
