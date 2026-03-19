/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_PATH: string;
  readonly VITE_DASHBOARD_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
