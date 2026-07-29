/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Anwendungsversion aus `package.json`, zur Bauzeit eingesetzt
 * (`vite.config.ts`, `define`). Wird in Sicherungsdateien und in den
 * Einstellungen angezeigt.
 */
declare const __APP_VERSION__: string;
