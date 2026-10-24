/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API, e.g. "/api/v1" (dev proxy) or "https://api.example.com/api/v1". */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
