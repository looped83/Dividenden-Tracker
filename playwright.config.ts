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
  // Die angemeldeten Ablaeufe haben eine eigene Konfiguration
  // (playwright.app.config.ts): eigener Build gegen die Testbruecke, eigener
  // Port, eigene Datenbank. Hier wuerden sie gegen die falsche Adresse laufen.
  testIgnore: "app/**",
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
    // `--host 127.0.0.1` ist wesentlich: Ohne die Angabe bindet die Vorschau an
    // `localhost`, was auf GitHub-Runnern zuerst zu `::1` aufgeloest wird —
    // Playwright fragt aber `127.0.0.1` ab und lief in den Timeout. Lokal fiel
    // das nicht auf, weil `localhost` hier auf IPv4 zeigt.
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}/`,
    reuseExistingServer: !process.env.CI,
    // Bauen und Starten zusammen; auf einem ausgelasteten Runner darf das
    // dauern, ohne den Lauf zu verlieren.
    timeout: 180_000,
    env: {
      // Platzhalter-Zugangsdaten wie im CI-Build: Ohne sie faltet der Bundler
      // die gesamte App als nicht erreichbaren Code weg (siehe ci.yml).
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "platzhalter-anon-key",
      // Der Pages-Build liegt unter einem Unterpfad; die Rauchtests laufen
      // gegen die Wurzel, damit die Adressen der Tests stimmen.
      GITHUB_PAGES: "false",
    },
  },
});
