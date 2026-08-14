import type { OnlineHttpResult } from '@conquarrow/contracts';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export const jsonResult = (statusCode: number, body: unknown): OnlineHttpResult => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export const unauthorized = (): OnlineHttpResult =>
  jsonResult(401, { error: 'unauthorized' });

export const forbidden = (): OnlineHttpResult => jsonResult(403, { error: 'forbidden' });

export const notFound = (): OnlineHttpResult => jsonResult(404, { error: 'not_found' });

export const conflict = (): OnlineHttpResult => jsonResult(409, { error: 'conflict' });

export const gone = (reason: 'revoked' | 'started'): OnlineHttpResult =>
  jsonResult(410, { reason });

export const unprocessable = (): OnlineHttpResult =>
  jsonResult(422, { error: 'unprocessable' });
