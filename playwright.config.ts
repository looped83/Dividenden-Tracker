import { defineConfig, devices } from "@playwright/test";

/**
 * Rauchtests gegen den **gebauten** Stand (`npm run build` + `vite preview`) —
 * nicht gegen den Entwicklungsserver: Nur so laufen Code-Splitting,
 * Basis-Pfad und Service Worker so, wie sie ausgeliefert werden. Genau die
 * Fehlerklasse, die Unit-Tests nicht sehen (weisse Seite nach dem Bauen),
 * faellt hier auf.
 *
 * Die Tests brauchen keinen Server und kein Konto: Sie decken die
 * oeffentlichen Routen, das Nachladen der Bereiche und die App-Huelle ab.
 * Angemeldete Ablaeufe gehoeren in die Integrationstests gegen eine echte
 * Datenbank (tests/integration).
 */
const PORT = 4173;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: "on-first-retry",
  },
  projects: [
    // iPhone-Geometrie und Touch, aber Chromium als Motor: WebKit steht in der
    // Entwicklungsumgebung nicht bereit. Echtes Safari-Verhalten (u. a. der
    // Zoom in Formularfelder) bleibt damit ungeprueft — dafuer braucht es
    // einen Lauf mit `npx playwright install webkit`.
    {
      name: "iPhone",
      use: {
        ...devices["iPhone 14"],
        // Im CI steht WebKit bereit (siehe ci.yml) — dort laeuft der
        // iPhone-Test mit Safaris Motor. Lokal genuegt Chromium mit
        // iPhone-Geometrie, damit die Rauchtests ohne weitere Installation
        // laufen.
        ...(process.env.CI ? {} : { browserName: "chromium" as const }),
      },
    },
    { name: "Desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Platzhalter-Zugangsdaten wie im CI-Build: Ohne sie faltet der Bundler
    // die gesamte App als nicht erreichbaren Code weg (siehe ci.yml).
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "platzhalter-anon-key",
    },
  },
});
