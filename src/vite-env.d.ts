/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_PATH: string;
  readonly VITE_DASHBOARD_PASSWORD: string;
  readonly VITE_SYNC_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
