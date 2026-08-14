/**
 * Google Identity Services (GIS) ID-token Sign-In for Pages.
 * `prompt()` is One Tap (auto unsigned-invite / 401). `offerChooser()` is
 * user-gesture Sign-In after One Tap skip/dismiss (P27).
 *
 * @see docs/spec/online-shell/online-shell.md
 * @see docs/spec/online-lobby-followup/online-lobby-followup.md
 */

import type { OnlinePagesGis } from '@conquarrow/contracts';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GisCredentialResponse {
  readonly credential?: string;
}

/** GIS One Tap prompt-moment notification (the predicates P27 cares about). */
export interface GisPromptNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
}

/**
 * Injectable `google.accounts.id` for tests (no jsdom). Production reads
 * `globalThis.google.accounts.id` after loading `gsi/client`.
 */
export interface BrowserGisId {
  initialize(config: {
    readonly client_id: string;
    readonly callback: (response: GisCredentialResponse) => void;
    readonly cancel_on_tap_outside?: boolean;
  }): void;
  prompt(momentListener?: (notification: GisPromptNotification) => void): void;
  renderButton?(parent: unknown, options?: unknown): void;
}

export type BrowserGisOptions = {
  readonly gisId?: BrowserGisId;
};

const gsiId = (): BrowserGisId | undefined => {
  const google = (globalThis as { google?: { accounts?: { id?: BrowserGisId } } }).google;
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

const GIS_CHOOSER_ID = 'conquarrow-gis-chooser';

const GIS_BUTTON = {
  theme: 'outline',
  size: 'large',
  type: 'standard',
  text: 'signin_with',
} as const;

/** True when One Tap was not displayed, skipped, or dismissed. */
export const gisOneTapFailed = (notification: GisPromptNotification): boolean =>
  notification.isNotDisplayed() ||
  notification.isSkippedMoment() ||
  notification.isDismissedMoment();

const chooserParent = (): unknown => {
  if (typeof document === 'undefined') {
    return { id: GIS_CHOOSER_ID };
  }
  const row = document.querySelector('.lobby-online-row');
  const host = row ?? document.body;
  const existing = document.getElementById(GIS_CHOOSER_ID);
  if (existing !== null) {
    if (existing.parentElement !== host) host.appendChild(existing);
    return existing;
  }
  const el = document.createElement('div');
  el.id = GIS_CHOOSER_ID;
  host.appendChild(el);
  return el;
};

const renderChooser = (id: BrowserGisId): void => {
  id.renderButton?.(chooserParent(), GIS_BUTTON);
};

/**
 * Outbound GIS. Production: `createBrowserGis(clientId, onCredential)`.
 * Tests may inject `gisId` so prompt runs without jsdom.
 */
export const createBrowserGis = (
  clientId: string,
  onCredential: GisCredentialHandler,
  options?: BrowserGisOptions,
): OnlinePagesGis => {
  let initialized = false;

  const initializeId = (id: BrowserGisId): void => {
    if (initialized) return;
    id.initialize({
      client_id: clientId,
      callback: (response) => {
        const token = response.credential;
        if (typeof token === 'string' && token !== '') onCredential(token);
      },
      cancel_on_tap_outside: false,
    });
    initialized = true;
  };

  const withId = (run: (id: BrowserGisId) => void): void => {
    if (clientId === '') return;
    const injected = options?.gisId;
    if (injected !== undefined) {
      run(injected);
      return;
    }
    void loadGsiScript()
      .then(() => {
        const id = gsiId();
        if (id === undefined) return;
        run(id);
      })
      .catch(() => {
        // Script blocked or offline — Sign-In stays a no-op.
      });
  };

  const oneTap = (id: BrowserGisId): void => {
    initializeId(id);
    id.prompt((notification) => {
      if (gisOneTapFailed(notification)) renderChooser(id);
    });
  };

  const showChooser = (id: BrowserGisId): void => {
    initializeId(id);
    renderChooser(id);
  };

  return {
    prompt: () => {
      withId(oneTap);
    },
    offerChooser: () => {
      withId(showChooser);
    },
  };
};
