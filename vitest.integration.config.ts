/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import path from "node:path";

/**
 * Separate Vitest-Konfiguration fuer Datenbank-/RLS-Integrationstests
 * (TEST_STRATEGY.md §5, §6). Laeuft gegen eine echte lokale PostgreSQL-
 * Instanz (scripts/db/reset-test-db.sh), daher node-Umgebung statt jsdom
 * und ein eigener, laengerer Timeout. Bewusst getrennt von der
 * Unit-Test-Konfiguration (vite.config.ts), damit `npm test` schnell und
 * ohne Datenbankabhaengigkeit bleibt.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
