export type GoogleRejectReason = 'missing' | 'expired' | 'invalid';

export type GoogleVerifyResult =
  | { readonly ok: true; readonly sub: string }
  | { readonly ok: false; readonly reason: GoogleRejectReason };

export interface GoogleVerifier {
  readonly verify: (
    authorizationHeader: string | undefined,
  ) => GoogleVerifyResult | Promise<GoogleVerifyResult>;
}

/** Byte store keyed like the match bucket (`conquarrow/…`). */
export interface ObjectStore {
  readonly get: (key: string) => string | undefined | Promise<string | undefined>;
  readonly put: (key: string, body: string) => void | Promise<void>;
  readonly listPrefix: (prefix: string) => readonly string[] | Promise<readonly string[]>;
}

export interface OnlineApiDeps {
  readonly google: GoogleVerifier;
  readonly s3: ObjectStore;
  readonly clock: () => number;
  readonly randomBytes: (size: number) => Uint8Array;
}
