/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ECO_TOKEN: string;
  readonly VITE_ECO_BACKEND: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
