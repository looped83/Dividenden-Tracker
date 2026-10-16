/**
 * Adressen der angemeldeten Browsertests. Bewusst eigene Ports, damit die
 * öffentlichen Rauchtests (`playwright.config.ts`, Port 4173) und die
 * angemeldete Suite nebeneinander laufen können.
 */
export const APP_PORT = 4174;
export const BRIDGE_PORT = 54321;

export const APP_ORIGIN = `http://127.0.0.1:${String(APP_PORT)}`;
/** Wird zur Bauzeit als `VITE_SUPABASE_URL` gesetzt (auch für die CSP). */
export const SUPABASE_URL = `http://127.0.0.1:${String(BRIDGE_PORT)}`;
/** Kein Geheimnis: Die Brücke prüft nur signierte Sitzungsmerkmale. */
export const ANON_KEY = "e2e-anon-key";
