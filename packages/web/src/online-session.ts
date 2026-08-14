/**
 * Google ID token in sessionStorage (`conquarrow:google-id-token`).
 *
 * @see docs/spec/online-web/online-web.md
 */

import {
  GOOGLE_ID_TOKEN_SESSION_KEY,
  type OnlinePagesSession,
} from '@conquarrow/contracts';

export { GOOGLE_ID_TOKEN_SESSION_KEY };

export const readSessionToken = (session: OnlinePagesSession): string | undefined => {
  const value = session.getItem(GOOGLE_ID_TOKEN_SESSION_KEY);
  if (value === null || value === '') return undefined;
  return value;
};

export const writeSessionToken = (session: OnlinePagesSession, token: string): void => {
  session.setItem(GOOGLE_ID_TOKEN_SESSION_KEY, token);
};

export const clearSessionToken = (session: OnlinePagesSession): void => {
  session.removeItem(GOOGLE_ID_TOKEN_SESSION_KEY);
};
