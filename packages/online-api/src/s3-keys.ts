const ROOT = 'conquarrow';

export const inviteKey = (token: string): string => `${ROOT}/invites/${token}.json`;

export const lobbyKey = (userHash: string, token: string): string =>
  `${ROOT}/users/${userHash}/lobbies/${token}`;

export const lobbyPrefix = (userHash: string): string =>
  `${ROOT}/users/${userHash}/lobbies/`;

export const userGroupKey = (userHash: string, groupHash: string): string =>
  `${ROOT}/users/${userHash}/groups/${groupHash}`;

export const userGroupPrefix = (userHash: string): string =>
  `${ROOT}/users/${userHash}/groups/`;

export const groupMetaKey = (groupHash: string): string =>
  `${ROOT}/groups/${groupHash}/meta.json`;

export const gameMetaKey = (groupHash: string, gameNumber: string): string =>
  `${ROOT}/groups/${groupHash}/games/${gameNumber}/meta.json`;

export const gamesPrefix = (groupHash: string): string =>
  `${ROOT}/groups/${groupHash}/games/`;
