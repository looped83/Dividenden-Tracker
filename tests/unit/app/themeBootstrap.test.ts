// @vitest-environment jsdom
// Fuehrt das Inline-Skript aus index.html gegen ein echtes `document` aus.
import { afterEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../../index.html?raw";

/**
 * Das Inline-Skript in `index.html` setzt das dunkle Design vor dem ersten
 * Zeichnen. Die CSP gibt es ueber seinen Hash frei — jede Aenderung am Skript,
 * auch nur an der Einrueckung, sperrt es stillschweigend aus, und der weisse
 * Blitz kaeme zurueck. Dieser Test macht das sichtbar.
 */
const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(indexHtml);
const script = scriptMatch?.[1] ?? "";

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function runScript(stored: string | null, systemDark: boolean): boolean {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  if (stored !== null) localStorage.setItem("dividend-tracker:theme", stored);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: systemDark && query === "(prefers-color-scheme: dark)",
  }));
  // Genau der ausgelieferte Text, deshalb keine Nachbildung der Logik.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(script) as () => void;
  run();
  return document.documentElement.classList.contains("dark");
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("Theme vor dem ersten Zeichnen (index.html)", () => {
  it("ist von der Content-Security-Policy per Hash freigegeben", async () => {
    expect(script.trim()).not.toBe("");
    const hash = await sha256Base64(script);
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
      indexHtml,
    )?.[1];
    expect(policy, `script-src braucht 'sha256-${hash}'`).toContain(`'sha256-${hash}'`);
  });

  it("folgt der gespeicherten Wahl vor dem System", () => {
    expect(runScript("dark", false)).toBe(true);
    expect(runScript("light", true)).toBe(false);
  });

  it("folgt ohne Wahl (oder bei „System“) dem Geraet", () => {
    expect(runScript(null, true)).toBe(true);
    expect(runScript("system", true)).toBe(true);
    expect(runScript(null, false)).toBe(false);
  });
});
