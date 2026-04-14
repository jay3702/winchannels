/// <reference types="vite/client" />

interface Window {
  __TAURI_INTERNALS__?: unknown;
}

declare const __APP_VERSION__: string;
declare const __APP_REPOSITORY_URL__: string;
