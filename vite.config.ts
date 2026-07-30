/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";
import { findMissingEnv, missingEnvMessage } from "./src/lib/config/requiredEnv";

// Die Anwendungsversion steht an genau einer Stelle (package.json) und wird zur
// Bauzeit eingesetzt. Sie landet in jeder Sicherungsdatei und in den
// Einstellungen; eine zweite, handgepflegte Kopie im Quelltext liefe
// unweigerlich auseinander.
const { version: appVersion } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// GitHub Pages liefert Projekt-Seiten unter einem Unterpfad
// (https://<user>.github.io/<repo>/) statt an der Domainwurzel. Der
// GitHub-Actions-Workflow setzt GITHUB_PAGES=true nur fuer den Pages-Build
// (DECISIONS.md D-030); andere Deployments (Vercel u. ae.) bleiben bei "/".
const base = process.env.GITHUB_PAGES === "true" ? "/Dividenden-Tracker/" : "/";

/**
 * Bricht den Production-Build ab, wenn Pflicht-Env-Variablen fehlen.
 * Begruendung siehe `src/lib/config/requiredEnv.ts`.
 */
function assertRequiredEnv(mode: string): void {
  const missing = findMissingEnv(loadEnv(mode, process.cwd(), ""));

  if (missing.length > 0) {
    throw new Error(missingEnvMessage(missing));
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    assertRequiredEnv(mode);
  }

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
      css: false,
      // Platzhalter-Zugangsdaten: `supabase/client.ts` wirft ohne diese Werte
      // beim Import auf Modulebene. Ohne sie liesse sich kein Modul testen,
      // das den Client (auch nur transitiv) importiert — Tests mussten die
      // Produktionslogik stattdessen kopieren, was echte Fehler verdeckte.
      // Es wird keine Verbindung aufgebaut; Netzwerkzugriffe sind gemockt.
      env: {
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test-anon-key",
      },
    },
  };
});
