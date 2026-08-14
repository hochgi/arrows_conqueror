/**
 * In-process factory for the P17 online HTTP port.
 *
 * Google verify, hashing, invite persistence, and Start live here. Tests inject
 * a fake verifier and a fake object store.
 *
 * @see docs/spec/online-auth-invites/online-auth-invites.md
 */

import type { OnlineHttpResult, OnlinePort, OnlineRequest } from '@conquarrow/contracts';
import type { OnlineApiDeps } from './api-types';
import {
  handleAccept,
  handleCreate,
  handleGetInvite,
  handleMe,
  handleMyGames,
  handleRevoke,
  handleStart,
} from './handlers';
import { notFound } from './json-result';

export type {
  GoogleRejectReason,
  GoogleVerifier,
  GoogleVerifyResult,
  ObjectStore,
  OnlineApiDeps,
} from './api-types';

type Route =
  | { readonly name: 'me' }
  | { readonly name: 'my-games' }
  | { readonly name: 'create' }
  | { readonly name: 'get-invite'; readonly token: string }
  | { readonly name: 'accept'; readonly token: string }
  | { readonly name: 'revoke'; readonly token: string }
  | { readonly name: 'start'; readonly token: string };

const matchGet = (path: string): Route | undefined => {
  if (path === '/me') return { name: 'me' };
  if (path === '/my-games') return { name: 'my-games' };
  const invite = /^\/invites\/([^/]+)$/.exec(path);
  const token = invite?.[1];
  if (token !== undefined) return { name: 'get-invite', token };
  return undefined;
};

const matchInviteAction = (path: string): Route | undefined => {
  const action = /^\/invites\/([^/]+)\/(accept|revoke|start)$/.exec(path);
  const token = action?.[1];
  const verb = action?.[2];
  if (token === undefined) return undefined;
  if (verb === 'accept') return { name: 'accept', token };
  if (verb === 'revoke') return { name: 'revoke', token };
  if (verb === 'start') return { name: 'start', token };
  return undefined;
};

const matchPost = (path: string): Route | undefined => {
  if (path === '/invites') return { name: 'create' };
  return matchInviteAction(path);
};

const matchRoute = (method: OnlineRequest['method'], path: string): Route | undefined =>
  method === 'GET' ? matchGet(path) : matchPost(path);

const dispatch = (deps: OnlineApiDeps, request: OnlineRequest): Promise<OnlineHttpResult> => {
  const route = matchRoute(request.method, request.path);
  if (route === undefined) return Promise.resolve(notFound());
  switch (route.name) {
    case 'me':
      return handleMe(deps, request);
    case 'my-games':
      return handleMyGames(deps, request);
    case 'create':
      return handleCreate(deps, request);
    case 'get-invite':
      return handleGetInvite(deps, route.token);
    case 'accept':
      return handleAccept(deps, request, route.token);
    case 'revoke':
      return handleRevoke(deps, request, route.token);
    case 'start':
      return handleStart(deps, request, route.token);
  }
};

export const createOnlineApi = (deps: OnlineApiDeps): OnlinePort => ({
  handle: (request: OnlineRequest): Promise<OnlineHttpResult> => dispatch(deps, request),
});
