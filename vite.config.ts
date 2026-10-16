/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { findMissingEnv, missingEnvMessage } from "./src/lib/config/requiredEnv";
import { injectServiceWorkerBuild } from "./src/lib/config/serviceWorkerBuild";

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

/**
 * Setzt Kennung der Fassung und Startpaket in den ausgelieferten Service Worker
 * ein — nach dem Schreiben des Bundles, wenn `index.html` und die aus
 * `public/` kopierte Vorlage `sw.js` im Ausgabeordner liegen. Warum, steht in
 * `src/lib/config/serviceWorkerBuild.ts`.
 */
function serviceWorkerBuild(): Plugin {
  let outDir = "";
  return {
    name: "dividend-tracker:service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, "sw.js");
      const indexHtml = readFileSync(path.join(outDir, "index.html"), "utf8");
      writeFileSync(
        swPath,
        injectServiceWorkerBuild(readFileSync(swPath, "utf8"), indexHtml),
      );
    },
  };
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
    plugins: [react(), tailwindcss(), serviceWorkerBuild()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      globals: true,
      setupFiles: ["./tests/setup.ts"],
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
      // Zwei Umgebungen: Reine Logik (`.test.ts`) laeuft in Node, nur
      // Komponenten (`.test.tsx`) brauchen den nachgebauten Browser. Zuvor lief
      // alles in jsdom — dessen Aufbau je Datei kostete bei den Logiktests
      // rund zwei Drittel ihrer Laufzeit (30 s statt 9,5 s). Eine Logikdatei,
      // die doch `window` braucht, sagt es selbst per `@vitest-environment`.
      projects: [
        {
          extends: true,
          test: {
            name: "logik",
            environment: "node",
            include: ["tests/unit/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "oberflaeche",
            environment: "jsdom",
            include: ["tests/unit/**/*.test.tsx"],
          },
        },
      ],
    },
  };
});
