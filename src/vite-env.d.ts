/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
