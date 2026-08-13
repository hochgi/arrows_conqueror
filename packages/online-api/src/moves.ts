import type { HttpResult } from './health.ts';

/** Sized for P18 heuristic burst. Product apply lands in P18. */
export const handler = (): Promise<HttpResult> =>
  Promise.resolve({
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'not_implemented' }),
  });
