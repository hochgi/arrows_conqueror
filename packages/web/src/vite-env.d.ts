/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_BYOK_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
