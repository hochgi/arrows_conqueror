/**
 * HTTP API Lambda entry: map API Gateway events onto `OnlinePort.handle`.
 *
 * Google verification stays behind `GoogleVerifier` (tokeninfo; `sub` / `aud` /
 * `exp` only). S3 is the object-store adapter. Env: `GOOGLE_CLIENT_IDS`,
 * `MATCH_BUCKET`.
 */

import { randomBytes } from 'node:crypto';
import { env } from 'node:process';
import type { OnlineHeaders, OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import { createOnlineApi } from './create-online-api';
import { createGoogleTokenInfoVerifier } from './google-tokeninfo';
import { asRecord } from './invite-record';
import { createS3Store } from './s3-store';

const clientIds = (): readonly string[] =>
  (env['GOOGLE_CLIENT_IDS'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

const headerValue = (
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined => {
  if (headers === undefined) return undefined;
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const lower = headers[name.toLowerCase()];
  if (typeof lower === 'string') return lower;
  return undefined;
};

const eventMethod = (event: Record<string, unknown>): 'GET' | 'POST' => {
  const ctx = asRecord(event['requestContext']);
  const http = ctx === undefined ? undefined : asRecord(ctx['http']);
  const fromCtx = http?.['method'];
  if (fromCtx === 'POST') return 'POST';
  if (typeof event['httpMethod'] === 'string' && event['httpMethod'] === 'POST') {
    return 'POST';
  }
  return 'GET';
};

const eventPath = (event: Record<string, unknown>): string => {
  const raw = event['rawPath'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  const path = event['path'];
  if (typeof path === 'string' && path.length > 0) return path;
  return '/';
};

const eventHeaders = (event: Record<string, unknown>): OnlineHeaders | undefined => {
  const raw = asRecord(event['headers']);
  const authorization = headerValue(raw, 'authorization');
  if (authorization === undefined) return undefined;
  return { authorization };
};

const eventBody = (event: Record<string, unknown>): string | undefined => {
  const body = event['body'];
  if (typeof body !== 'string') return undefined;
  if (event['isBase64Encoded'] === true) {
    const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return body;
};

export const toOnlineRequest = (event: unknown): OnlineRequest => {
  const rec = asRecord(event) ?? {};
  const headers = eventHeaders(rec);
  const body = eventBody(rec);
  return {
    method: eventMethod(rec),
    path: eventPath(rec),
    ...(headers === undefined ? {} : { headers }),
    ...(body === undefined ? {} : { body }),
  };
};

const clock = (): number => Date.now();

const api = createOnlineApi({
  google: createGoogleTokenInfoVerifier({
    clientIds: clientIds(),
    clock,
    fetch: globalThis.fetch,
  }),
  s3: createS3Store(env['MATCH_BUCKET'] ?? ''),
  clock,
  randomBytes: (size) => randomBytes(size),
});

export const handler = (event: unknown): Promise<OnlineHttpResult> =>
  api.handle(toOnlineRequest(event));
