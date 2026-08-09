/**
 * BYOK (bring-your-own-key) config for the optional LLM opponent.
 *
 * Persists in localStorage for the browser profile (playtest convenience).
 * Never written into match logs. Never sent to any arrows server.
 */

export const BYOK_STORAGE_KEY = 'arrows-conqueror:byok';

export interface ByokConfig {
  readonly enabled: boolean;
  /** OpenAI-compatible base, e.g. `https://api.openai.com/v1` (no trailing slash required). */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export const DEFAULT_BYOK: ByokConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export const isByokReady = (config: ByokConfig): boolean =>
  config.enabled &&
  config.baseUrl.trim().length > 0 &&
  config.apiKey.trim().length > 0 &&
  config.model.trim().length > 0;

const readStore = (): Storage | undefined => {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return undefined;
};

export const loadByokConfig = (): ByokConfig => {
  const store = readStore();
  if (store === undefined) return DEFAULT_BYOK;
  try {
    const raw = store.getItem(BYOK_STORAGE_KEY);
    if (raw === null || raw === '') return DEFAULT_BYOK;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BYOK;
    const o = parsed as Record<string, unknown>;
    return {
      enabled: o['enabled'] === true,
      baseUrl: typeof o['baseUrl'] === 'string' ? o['baseUrl'] : DEFAULT_BYOK.baseUrl,
      apiKey: typeof o['apiKey'] === 'string' ? o['apiKey'] : '',
      model: typeof o['model'] === 'string' ? o['model'] : DEFAULT_BYOK.model,
    };
  } catch {
    return DEFAULT_BYOK;
  }
};

export const saveByokConfig = (config: ByokConfig): void => {
  const store = readStore();
  if (store === undefined) return;
  store.setItem(BYOK_STORAGE_KEY, JSON.stringify(config));
};

/** Normalize so `${base}/chat/completions` is well-formed. */
export const chatCompletionsUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmed}/chat/completions`;
};
