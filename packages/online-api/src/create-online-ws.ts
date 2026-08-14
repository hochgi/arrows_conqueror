/**
 * In-process WebSocket port: verify Google ID token on `$connect`, register
 * `connections/<userHash>/<connectionId>`, delete on `$disconnect`.
 *
 * @see docs/spec/online-moves-ws/online-moves-ws.md
 */

import type { OnlineWsPort, WsConnectRequest, WsDisconnectRequest } from '@conquarrow/contracts';
import type { OnlineApiDeps } from './api-types';
import { userHashFromSub } from './hashing';
import { connectionKey, connectionsRoot } from './s3-keys';
import { deleteObject, listObjects, putObject } from './store-io';

const POINTER = '{}';

const lastSegment = (key: string): string | undefined => {
  const slash = key.lastIndexOf('/');
  if (slash < 0 || slash === key.length - 1) return undefined;
  return key.slice(slash + 1);
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
  await putObject(deps.s3, connectionKey(userHash, request.connectionId), POINTER);
  return { statusCode: 200 };
};

const disconnect = async (
  deps: OnlineApiDeps,
  request: WsDisconnectRequest,
): Promise<{ readonly statusCode: number }> => {
  if (request.userHash !== undefined) {
    await deleteObject(deps.s3, connectionKey(request.userHash, request.connectionId));
    return { statusCode: 200 };
  }
  const keys = await listObjects(deps.s3, connectionsRoot());
  for (const key of keys) {
    if (lastSegment(key) === request.connectionId) {
      await deleteObject(deps.s3, key);
    }
  }
  return { statusCode: 200 };
};

export const createOnlineWs = (deps: OnlineApiDeps): OnlineWsPort => ({
  connect: (request) => connect(deps, request),
  disconnect: (request) => disconnect(deps, request),
});
