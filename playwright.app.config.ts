import { defineConfig, devices } from "@playwright/test";
import { ANON_KEY, APP_ORIGIN, APP_PORT, SUPABASE_URL } from "./tests/e2e/support/ports";

/**
 * Angemeldete Browsertests (TEST_STRATEGY.md, Phase A) — die fünf Kernabläufe
 * Erfassen, Bearbeiten, Stornieren, Import und Sicherung sowie axe auf den
 * Routen hinter der Anmeldung.
 *
 * Sie laufen gegen den **gebauten** Stand und gegen eine **echte**
 * PostgreSQL-Testdatenbank: `tests/e2e/support/bridge.ts` übersetzt die
 * HTTP-Aufrufe von supabase-js in SQL und führt sie mit Rolle `authenticated`
 * plus JWT-Claims aus. RLS, Constraints, Trigger und die RPCs sind damit real —
 * nur der Transportweg ist nachgebaut.
 *
 * Voraussetzung: `npm run db:test:reset` (siehe `npm run test:e2e:app`).
 *
 * Getrennt von `playwright.config.ts`, damit die öffentlichen Rauchtests
 * weiterhin ohne Datenbank laufen.
 */
export default defineConfig({
  testDir: "./tests/e2e/app",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  globalSetup: "./tests/e2e/support/globalSetup.ts",
  use: {
    baseURL: APP_ORIGIN,
    trace: "on-first-retry",
    // Der Service Worker würde Anfragen aus dem Cache bedienen und den
    // Testablauf verschleiern; sein Verhalten prüfen die öffentlichen
    // Rauchtests.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "Desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Im CI mit Safaris Motor (WebKit ist dort installiert), lokal mit
      // Chromium in iPhone-Geometrie — wie in den Rauchtests.
      name: "iPhone",
      use: {
        ...devices["iPhone 14"],
        ...(process.env.CI ? {} : { browserName: "chromium" as const }),
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${String(APP_PORT)} --strictPort`,
    url: `${APP_ORIGIN}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Bauzeit-Adresse der Brücke: steht damit auch in der CSP (`connect-src`).
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: ANON_KEY,
      GITHUB_PAGES: "false",
    },
  },
});
