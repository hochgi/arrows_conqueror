/**
 * Pages online host (P25). DOM-free binder around {@link OnlinePagesPort}:
 * GIS credential, hashchange → boot, visibility → becomeVisible, and WS
 * `stateChanged` JSON. Tests inject the same fakes as P19 — no jsdom, no React.
 *
 * Start offered is a host concern: every human on `inviteSeats()` is bound.
 * HTTP 410 on invite is gone even when `reason` is missing. POST 422 surfaces
 * `illegal` here; the adapter keeps the last GET.
 *
 * @see docs/spec/online-shell/online-shell.md
 * @see docs/adr/0002-cheap-async-online.md
 */

import type { Move } from './move';
import type { GameNumber, GroupHash, PlannedSeatKind } from './online-port';
import type {
  OnlineGameBoard,
  OnlinePagesDeps,
  OnlinePagesPort,
  PagesLobbyMode,
} from './online-pages-port';

/**
 * Same I/O facades as P19. The host constructs `OnlinePagesPort` internally.
 * Tests drive explicit handlers — not `window` listeners.
 */
export type OnlineHostDeps = OnlinePagesDeps;

/**
 * Pages online host. A second implementation can satisfy the same suite.
 * I/O is observed on the injected fakes; the board is the adapter GET.
 */
export interface OnlineHostPort {
  /** The P19 adapter this host wraps. */
  adapter(): OnlinePagesPort;

  boot(): Promise<void>;
  selectMode(mode: PagesLobbyMode): void;
  setSeatPlan(seats: readonly PlannedSeatKind[]): void;
  /** Local → `startLocalMatch`; Online → `startOnlineMatch` when offered. */
  start(): Promise<void>;
  createInvite(): Promise<void>;
  acceptInvite(): Promise<void>;
  submitMove(move: Move): Promise<void>;
  refreshLibrary(): Promise<void>;
  openMyGame(groupHash: GroupHash, gameNumber: GameNumber): Promise<void>;
  signOut(): void;
  /** Sign-In click — outbound GIS prompt. */
  promptSignIn(): void;

  /** `hashchange` → adapter `boot`. Tests set `location.hash` first. */
  handleHashChange(): Promise<void>;
  /** `visibilitychange` to visible → adapter `becomeVisible`. */
  handleVisibility(visible: boolean): Promise<void>;
  /**
   * WS `onmessage` text. Forwards only JSON
   * `{ type: "stateChanged", version, groupHash, gameNumber }`.
   * Invalid JSON and other types are ignored.
   */
  handleSocketMessage(raw: string): Promise<void>;
  /** GIS credential → adapter `deliverGoogleCredential`. */
  handleGisCredential(idToken: string): Promise<void>;

  onlineModeOffered(): boolean;
  /**
   * Online: every human on `inviteSeats()` is bound.
   * Local: today's seat-plan ready (not the Online gate).
   */
  startOffered(): boolean;
  /**
   * Signed in, invite token present, not gone, not full.
   * Does not auto-accept — the shell shows Accept.
   */
  acceptOffered(): boolean;
  createOffered(): boolean;
  /** Current Local | Online selection. Invite/game hash selects Online on boot. */
  mode(): PagesLobbyMode;
  /** Short shell string after POST moves 422; otherwise undefined. */
  illegal(): string | undefined;
  /** True after invite GET or accept HTTP 410, even when `reason` is missing. */
  inviteGone(): boolean;
  seatKindOptions(): readonly PlannedSeatKind[];
  copiedInviteUrl(): string | undefined;
  board(): OnlineGameBoard | undefined;
  localMatchStarted(): boolean;
}
