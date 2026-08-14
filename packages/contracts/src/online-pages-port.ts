/**
 * Pages online adapter (P19). DOM-free facades so tests inject fake GIS,
 * fetch, WebSocket, and sessionStorage. The web package implements this.
 *
 * Google `sub` never appears on a DTO the adapter copies into a URL.
 *
 * @see docs/spec/online-web/online-web.md
 * @see docs/adr/0002-cheap-async-online.md
 */

import type { Move } from './move';
import type {
  GameNumber,
  GroupHash,
  InviteSeat,
  InviteToken,
  MyGamesBody,
  PlannedSeatKind,
  StateChangedPayload,
} from './online-port';

/** sessionStorage key for the Google ID token (ADR 0002 / P19). */
export const GOOGLE_ID_TOKEN_SESSION_KEY = 'conquarrow:google-id-token';

export type PagesLobbyMode = 'local' | 'online';

/** Last successful GET `/games/:groupHash/:gameNumber` body. */
export interface OnlineGameBoard {
  readonly version: number;
  readonly state: unknown;
}

export interface OnlinePagesEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_WS_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

export interface OnlinePagesSession {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OnlinePagesLocation {
  readonly origin: string;
  readonly pathname: string;
  hash: string;
}

export interface OnlinePagesHttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface OnlinePagesHttpResponse {
  readonly status: number;
  readonly body: string;
}

export type OnlinePagesFetch = (
  request: OnlinePagesHttpRequest,
) => Promise<OnlinePagesHttpResponse>;

export interface OnlinePagesSocket {
  readonly url: string;
  close(): void;
}

export type OnlinePagesOpenSocket = (url: string) => OnlinePagesSocket;

/** Outbound: the adapter asks GIS to collect a credential. */
export interface OnlinePagesGis {
  prompt(): void;
}

export interface OnlinePagesDeps {
  readonly env: OnlinePagesEnv;
  readonly session: OnlinePagesSession;
  readonly location: OnlinePagesLocation;
  readonly fetch: OnlinePagesFetch;
  readonly openSocket: OnlinePagesOpenSocket;
  readonly gis: OnlinePagesGis;
}

/**
 * Pages online adapter. Tests drive this port; a second implementation can
 * satisfy the same suite. I/O is observed on the injected fakes.
 */
export interface OnlinePagesPort {
  boot(): Promise<void>;
  selectMode(mode: PagesLobbyMode): void;
  setSeatPlan(seats: readonly PlannedSeatKind[]): void;
  createInvite(): Promise<void>;
  startLocalMatch(): void;
  startOnlineMatch(): Promise<void>;
  acceptInvite(): Promise<void>;
  submitMove(move: Move): Promise<void>;
  refreshLibrary(): Promise<void>;
  openMyGame(groupHash: GroupHash, gameNumber: GameNumber): Promise<void>;
  signOut(): void;
  deliverGoogleCredential(idToken: string): Promise<void>;
  receiveStateChanged(payload: StateChangedPayload): Promise<void>;
  becomeVisible(): Promise<void>;

  onlineModeOffered(): boolean;
  seatKindOptions(): readonly PlannedSeatKind[];
  createOffered(): boolean;
  localMatchStarted(): boolean;
  copiedInviteUrl(): string | undefined;
  board(): OnlineGameBoard | undefined;
  lobbyFull(): boolean;
  inviteGoneReason(): 'revoked' | 'started' | undefined;
  inviteSeats(): readonly InviteSeat[] | undefined;
  inviteToken(): InviteToken | undefined;
  myGames(): MyGamesBody | undefined;
}
