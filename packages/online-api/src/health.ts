export interface HttpResult {
  readonly statusCode: number;
  readonly headers: { readonly 'content-type': string };
  readonly body: string;
}

/** Public liveness probe — no auth (P16). */
export const handler = (): Promise<HttpResult> =>
  Promise.resolve({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, service: 'conquarrow' }),
  });
