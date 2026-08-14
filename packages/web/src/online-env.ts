/**
 * Online mode is off unless every Pages env var is non-empty (P19 / ADR 0002).
 *
 * @see docs/spec/online-web/online-web.md
 */

import type { OnlinePagesEnv } from '@conquarrow/contracts';

export const isOnlineEnvReady = (env: OnlinePagesEnv): boolean =>
  env.VITE_API_BASE !== '' && env.VITE_WS_URL !== '' && env.VITE_GOOGLE_CLIENT_ID !== '';
