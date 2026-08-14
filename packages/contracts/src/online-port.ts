/**
 * Online auth, invites, and library — the inbound HTTP port (P17).
 *
 * Tests and adapters speak this surface. `userHash` / `groupHash` hashing is an
 * adapter concern (`packages/online-api`); this package stays free of `crypto`
 * (eslint purity guard). Google `sub` never appears on a DTO returned to a
 * client.
 *
 * Paths are those the handlers see under the `/conquarrow` mapping — `/me`,
 * `/invites/:token/accept`, not the mapped prefix.
 *
 * @see docs/spec/online-auth-invites/online-auth-invites.md
 * @see docs/adr/0002-cheap-async-online.md
 */

/** 32 lowercase hex characters — adapter: `truncate16(SHA-256(sub))`. */
export type UserHash = string;

/** Opaque invite token: 32 CSPRNG bytes, hex-encoded (64 characters). */
export type InviteToken = string;

/**
 * 32 lowercase hex characters — adapter:
 * `truncate16(SHA-256(sorted human userHashes joined by newline))`.
 * Heuristic seats and 3-vs-6 are not in the preimage.
 */
export type GroupHash = string;

/** Six-digit game counter from 1 (`000001`, …). Never reused to overwrite. */
export type GameNumber = string;

/** Seat kinds a create request may name. `byok` is refused (422). */
export type PlannedSeatKind = 'human' | 'heuristic' | 'byok';

/**
 * A chair on an invite or game meta.
 * A human chair is bound iff `userHash` is a string (never a Google `sub`).
 */
export type InviteSeat =
  | { readonly kind: 'human'; readonly userHash?: UserHash }
  | { readonly kind: 'heuristic' };

export interface CreateInviteBody {
  readonly seats: readonly PlannedSeatKind[];
  readonly hostSeatIndex?: number;
}

export interface MeBody {
  readonly userHash: UserHash;
}

export interface InviteBody {
  readonly token: InviteToken;
  readonly seats: readonly InviteSeat[];
}

export interface StartBody {
  readonly groupHash: GroupHash;
  readonly gameNumber: GameNumber;
}

export interface OpenLobbyRow {
  readonly token: InviteToken;
}

export interface StartedGameRow {
  readonly groupHash: GroupHash;
  readonly gameNumber: GameNumber;
}

export interface MyGamesBody {
  readonly lobbies: readonly OpenLobbyRow[];
  readonly games: readonly StartedGameRow[];
}

export interface GoneBody {
  readonly reason: 'revoked' | 'started';
}

export interface OnlineHeaders {
  readonly authorization?: string;
}

export interface OnlineRequest {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly headers?: OnlineHeaders;
  readonly body?: string;
}

export interface OnlineHttpResult {
  readonly statusCode: number;
  readonly headers: { readonly 'content-type': string };
  readonly body: string;
}

/**
 * The online HTTP surface. One `handle` so a second adapter (in-process test
 * factory, Lambda event mapper) can satisfy the same suite.
 */
export interface OnlinePort {
  handle(request: OnlineRequest): Promise<OnlineHttpResult>;
}
