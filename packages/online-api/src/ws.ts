/**
 * WebSocket `$connect` / `$disconnect` Lambda — verify the token, write or
 * delete `connections/<userHash>/<connectionId>`. Missing token fails closed.
 */

import { env } from 'node:process';
import { createOnlineWs } from './create-online-ws';
import { createGoogleTokenInfoVerifier } from './google-tokeninfo';
import { asRecord } from './invite-record';
import { createS3Store } from './s3-store';

const clientIds = (): readonly string[] =>
  (env['GOOGLE_CLIENT_IDS'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

const clock = (): number => Date.now();

const ws = createOnlineWs({
  google: createGoogleTokenInfoVerifier({
    clientIds: clientIds(),
    clock,
    fetch: globalThis.fetch,
  }),
  s3: createS3Store(env['MATCH_BUCKET'] ?? ''),
  clock,
  randomBytes: () => new Uint8Array(0),
});

const connectionIdOf = (event: Record<string, unknown>): string | undefined => {
  const ctx = asRecord(event['requestContext']);
  const id = ctx?.['connectionId'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

const routeOf = (event: Record<string, unknown>): '$connect' | '$disconnect' | undefined => {
  const ctx = asRecord(event['requestContext']);
  const routeKey = ctx?.['routeKey'];
  if (routeKey === '$connect' || routeKey === '$disconnect') return routeKey;
  const eventType = ctx?.['eventType'];
  if (eventType === 'CONNECT') return '$connect';
  if (eventType === 'DISCONNECT') return '$disconnect';
  return undefined;
};

const accessTokenOf = (event: Record<string, unknown>): string | undefined => {
  const query = asRecord(event['queryStringParameters']);
  const token = query?.['access_token'];
  return typeof token === 'string' && token.length > 0 ? token : undefined;
};

export const handler = (event?: unknown): Promise<{ readonly statusCode: number }> => {
  const rec = asRecord(event);
  if (rec === undefined) return Promise.resolve({ statusCode: 401 });
  const connectionId = connectionIdOf(rec);
  if (connectionId === undefined) return Promise.resolve({ statusCode: 401 });
  const route = routeOf(rec);
  if (route === '$disconnect') {
    return ws.disconnect({ connectionId });
  }
  if (route !== '$connect') return Promise.resolve({ statusCode: 401 });
  const accessToken = accessTokenOf(rec);
  return accessToken === undefined
    ? ws.connect({ connectionId })
    : ws.connect({ connectionId, accessToken });
};
