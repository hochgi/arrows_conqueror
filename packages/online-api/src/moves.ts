import type { HttpResult } from './health.ts';

/** P16 `POST /moves` stub retired — play is nested under `/games/.../moves`. */
export const handler = (): Promise<HttpResult> =>
  Promise.resolve({
    statusCode: 404,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'not_found' }),
  });
