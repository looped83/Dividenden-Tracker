/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// GitHub Pages liefert Projekt-Seiten unter einem Unterpfad
// (https://<user>.github.io/<repo>/) statt an der Domainwurzel. Der
// GitHub-Actions-Workflow setzt GITHUB_PAGES=true nur fuer den Pages-Build
// (DECISIONS.md D-030); andere Deployments (Vercel u. ae.) bleiben bei "/".
const base = process.env.GITHUB_PAGES === "true" ? "/Dividenden-Tracker/" : "/";

export default defineConfig({
  base,
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
  },
});
