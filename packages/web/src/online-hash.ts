/**
 * Hash routes `#/invite/<token>` and `#/g/<groupHash>/<gameNumber>`.
 *
 * @see docs/spec/online-web/online-web.md
 */

import type { GameNumber, GroupHash, InviteToken } from '@conquarrow/contracts';

export type PagesHash =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'invite'; readonly token: InviteToken }
  | { readonly kind: 'game'; readonly groupHash: GroupHash; readonly gameNumber: GameNumber };

const withHash = (hash: string): string => (hash.startsWith('#') ? hash : `#${hash}`);

export const parsePagesHash = (hash: string): PagesHash => {
  const trimmed = withHash(hash);
  const invite = /^#\/invite\/([^/]+)$/.exec(trimmed);
  const inviteToken = invite?.[1];
  if (inviteToken !== undefined) {
    return { kind: 'invite', token: inviteToken };
  }
  const game = /^#\/g\/([^/]+)\/([^/]+)$/.exec(trimmed);
  const groupHash = game?.[1];
  const gameNumber = game?.[2];
  if (groupHash !== undefined && gameNumber !== undefined) {
    return { kind: 'game', groupHash, gameNumber };
  }
  return { kind: 'lobby' };
};

export const formatInviteHash = (token: InviteToken): string => `#/invite/${token}`;

export const formatGameHash = (groupHash: GroupHash, gameNumber: GameNumber): string =>
  `#/g/${groupHash}/${gameNumber}`;

export const copiedInviteUrl = (
  origin: string,
  pathname: string,
  token: InviteToken,
): string => `${origin}${pathname}${formatInviteHash(token)}`;
