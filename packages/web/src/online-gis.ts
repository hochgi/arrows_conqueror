/**
 * Google Identity Services (GIS) ID-token Sign-In for Pages.
 * `prompt()` loads `gsi/client` and yields the credential into the host.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import type { OnlinePagesGis } from '@conquarrow/contracts';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GisCredentialResponse {
  readonly credential?: string;
}

interface GisId {
  initialize(config: {
    readonly client_id: string;
    readonly callback: (response: GisCredentialResponse) => void;
  }): void;
  prompt(): void;
}

const gsiId = (): GisId | undefined => {
  const google = (globalThis as { google?: { accounts?: { id?: GisId } } }).google;
  return google?.accounts?.id;
};

const loadGsiScript = (): Promise<void> => {
  if (gsiId() !== undefined) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
  if (existing instanceof HTMLScriptElement) {
    if (gsiId() !== undefined) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => {
        resolve();
      });
      existing.addEventListener('error', () => {
        resolve();
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      resolve();
    });
    script.addEventListener('error', () => {
      reject(new Error('GIS script failed to load'));
    });
    document.head.appendChild(script);
  });
};

export type GisCredentialHandler = (idToken: string) => void;

/**
 * Outbound GIS prompt. The App button calls `prompt()`; GIS calls `onCredential`.
 */
export const createBrowserGis = (
  clientId: string,
  onCredential: GisCredentialHandler,
): OnlinePagesGis => {
  let initialized = false;
  return {
    prompt: () => {
      if (clientId === '') return;
      void loadGsiScript()
        .then(() => {
          const id = gsiId();
          if (id === undefined) return;
          if (!initialized) {
            id.initialize({
              client_id: clientId,
              callback: (response) => {
                const token = response.credential;
                if (typeof token === 'string' && token !== '') onCredential(token);
              },
            });
            initialized = true;
          }
          id.prompt();
        })
        .catch(() => {
          // Script blocked or offline — Sign-In stays a no-op.
        });
    },
  };
};
