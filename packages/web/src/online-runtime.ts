/**
 * Construct the Pages host once and bind window listeners.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import { useCallback, useEffect, useState } from 'react';
import type { OnlineHostPort } from '@conquarrow/contracts';
import { createBrowserGis } from './online-gis';
import { createOnlineHost } from './online-host';
import {
  browserFetch,
  browserLocation,
  browserOpenSocket,
  browserSession,
  envFromVite,
} from './online-window';

export interface PagesRuntime {
  readonly host: OnlineHostPort;
  dispose(): void;
}

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const fn of listeners) fn();
};

let shared: PagesRuntime | undefined;

export const createPagesRuntime = (onChange: () => void): PagesRuntime => {
  const env = envFromVite();
  const box: { host: OnlineHostPort | undefined } = { host: undefined };

  const deliver = (idToken: string): void => {
    const current = box.host;
    if (current === undefined) return;
    void current.handleGisCredential(idToken).then(onChange);
  };

  const host = createOnlineHost({
    env,
    session: browserSession(),
    location: browserLocation(),
    fetch: browserFetch,
    openSocket: browserOpenSocket((raw) => {
      const current = box.host;
      if (current === undefined) return;
      void current.handleSocketMessage(raw).then(onChange);
    }),
    gis: createBrowserGis(env.VITE_GOOGLE_CLIENT_ID, deliver),
  });
  box.host = host;

  const onHash = (): void => {
    void host.handleHashChange().then(onChange);
  };
  const onVisibility = (): void => {
    void host.handleVisibility(document.visibilityState === 'visible').then(onChange);
  };
  window.addEventListener('hashchange', onHash);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    host,
    dispose: () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
};

export const usePagesHost = (): {
  readonly host: OnlineHostPort | undefined;
  readonly gen: number;
  readonly refresh: () => void;
} => {
  const [gen, setGen] = useState(0);
  const [host, setHost] = useState<OnlineHostPort | undefined>(undefined);
  const refresh = useCallback(() => {
    setGen((n) => n + 1);
  }, []);
  useEffect(() => {
    listeners.add(refresh);
    if (shared === undefined) {
      shared = createPagesRuntime(notify);
      void shared.host.boot().then(notify);
    }
    setHost(shared.host);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);
  return { host, gen, refresh };
};
