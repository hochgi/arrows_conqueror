/**
 * Pages online host — GIS / hash / visibility / WS binder around createOnlinePages.
 *
 * HTTP 410 on invite is gone even when `reason` is missing. POST 422 surfaces
 * `illegal` here; the adapter keeps the last GET.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import type {
  InviteSeat,
  Move,
  OnlineHostDeps,
  OnlineHostPort,
  OnlinePagesFetch,
  OnlinePagesHttpRequest,
  OnlinePagesHttpResponse,
  PagesLobbyMode,
  PlannedSeatKind,
} from '@conquarrow/contracts';
import { parsePagesHash } from './online-hash';
import { createOnlinePages } from './online-pages';
import { parseStateChanged } from './online-parse';
import { readSessionToken } from './online-session';

const humansAllBound = (seats: readonly InviteSeat[] | undefined): boolean => {
  if (seats === undefined) return false;
  for (const seat of seats) {
    if (seat.kind === 'human' && seat.userHash === undefined) return false;
  }
  return true;
};

const requestPath = (url: string): string => {
  const stripped = url.split('?')[0] ?? url;
  try {
    return new URL(stripped).pathname;
  } catch {
    return stripped;
  }
};

const isInvitePeek = (method: string, path: string): boolean =>
  method === 'GET' && /\/invites\/[^/]+$/.test(path);

const isInviteAccept = (method: string, path: string): boolean =>
  method === 'POST' && /\/invites\/[^/]+\/accept$/.test(path);

const isInviteCreate = (method: string, path: string): boolean =>
  method === 'POST' && /\/invites$/.test(path);

const isPostMoves = (method: string, path: string): boolean =>
  method === 'POST' && path.endsWith('/moves');

const is2xx = (status: number): boolean => status >= 200 && status < 300;

export const createOnlineHost = (deps: OnlineHostDeps): OnlineHostPort => {
  let mode: PagesLobbyMode = 'local';
  let illegalMsg: string | undefined;
  let inviteGoneFlag = false;

  const noteResponse = (req: OnlinePagesHttpRequest, res: OnlinePagesHttpResponse): void => {
    const path = requestPath(req.url);
    if ((isInvitePeek(req.method, path) || isInviteAccept(req.method, path)) && res.status === 410) {
      inviteGoneFlag = true;
    }
    if (isInvitePeek(req.method, path) && res.status === 200) inviteGoneFlag = false;
    if (isInviteAccept(req.method, path) && res.status === 200) inviteGoneFlag = false;
    if (isInviteCreate(req.method, path) && is2xx(res.status)) inviteGoneFlag = false;
    if (isPostMoves(req.method, path) && res.status === 422) {
      illegalMsg = 'illegal';
      return;
    }
    if (is2xx(res.status)) illegalMsg = undefined;
  };

  const fetch: OnlinePagesFetch = async (req) => {
    const res = await deps.fetch(req);
    noteResponse(req, res);
    return res;
  };

  const pages = createOnlinePages({ ...deps, fetch });

  const signedIn = (): boolean => readSessionToken(deps.session) !== undefined;

  const syncModeFromHash = (): void => {
    if (!pages.onlineModeOffered()) return;
    const route = parsePagesHash(deps.location.hash);
    if (route.kind === 'invite' || route.kind === 'game') {
      mode = 'online';
      pages.selectMode('online');
    }
  };

  const boot = async (): Promise<void> => {
    await pages.boot();
    syncModeFromHash();
  };

  const startOffered = (): boolean => {
    if (mode === 'online' && pages.onlineModeOffered()) {
      return humansAllBound(pages.inviteSeats());
    }
    return true;
  };

  const start = async (): Promise<void> => {
    if (mode === 'online' && pages.onlineModeOffered()) {
      if (startOffered()) await pages.startOnlineMatch();
      return;
    }
    pages.startLocalMatch();
  };

  const signOut = (): void => {
    pages.signOut();
    illegalMsg = undefined;
    inviteGoneFlag = false;
    mode = 'local';
    pages.selectMode('local');
  };

  const acceptOffered = (): boolean =>
    mode === 'online' &&
    pages.onlineModeOffered() &&
    signedIn() &&
    pages.inviteToken() !== undefined &&
    !inviteGoneFlag &&
    pages.inviteGoneReason() === undefined &&
    !pages.lobbyFull();

  return {
    adapter: () => pages,
    boot,
    selectMode: (next: PagesLobbyMode) => {
      mode = next;
      pages.selectMode(next);
    },
    setSeatPlan: (seats: readonly PlannedSeatKind[]) => {
      pages.setSeatPlan(seats);
    },
    start,
    createInvite: () => pages.createInvite(),
    acceptInvite: () => pages.acceptInvite(),
    submitMove: (move: Move) => pages.submitMove(move),
    refreshLibrary: () => pages.refreshLibrary(),
    openMyGame: (groupHash, gameNumber) => pages.openMyGame(groupHash, gameNumber),
    signOut,
    promptSignIn: () => {
      deps.gis.prompt();
    },
    handleHashChange: async () => {
      await pages.boot();
      syncModeFromHash();
    },
    handleVisibility: (visible: boolean) => {
      if (!visible) return Promise.resolve();
      return pages.becomeVisible();
    },
    handleSocketMessage: async (raw: string) => {
      const payload = parseStateChanged(raw);
      if (payload === undefined) return;
      await pages.receiveStateChanged(payload);
    },
    handleGisCredential: (idToken: string) => pages.deliverGoogleCredential(idToken),
    onlineModeOffered: () => pages.onlineModeOffered(),
    startOffered,
    acceptOffered,
    createOffered: () => pages.createOffered() && signedIn(),
    mode: () => mode,
    illegal: () => illegalMsg,
    inviteGone: () => inviteGoneFlag || pages.inviteGoneReason() !== undefined,
    seatKindOptions: () => pages.seatKindOptions(),
    copiedInviteUrl: () => pages.copiedInviteUrl(),
    board: () => pages.board(),
    localMatchStarted: () => pages.localMatchStarted(),
  };
};
