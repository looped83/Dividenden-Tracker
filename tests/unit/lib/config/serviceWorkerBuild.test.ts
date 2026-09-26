import { describe, expect, it } from "vitest";
import { buildIdOf, injectServiceWorkerBuild } from "@/lib/config/serviceWorkerBuild";

// So sieht der Kopf der gebauten index.html aus (Vite, Basis-Pfad von Pages).
const INDEX_HTML = `<!doctype html><html><head>
<script>/* Theme, inline */</script>
<link rel="manifest" href="./manifest.webmanifest" />
<script type="module" crossorigin src="/Dividenden-Tracker/assets/index-AbC123.js"></script>
<link rel="modulepreload" crossorigin href="/Dividenden-Tracker/assets/client-XyZ.js">
<link rel="modulepreload" crossorigin href="/Dividenden-Tracker/assets/client-XyZ.js">
<link rel="stylesheet" crossorigin href="/Dividenden-Tracker/assets/index-Css9.css">
</head><body><div id="root"></div></body></html>`;

const TEMPLATE = `const BUILD_ID = "__BUILD_ID__";\nconst PRECACHE = ["__PRECACHE__"];\n`;

describe("injectServiceWorkerBuild", () => {
  it("setzt Kennung und Startpaket aus index.html ein", () => {
    const result = injectServiceWorkerBuild(TEMPLATE, INDEX_HTML);
    expect(result).toBe(
      'const BUILD_ID = "index-AbC123.js";\n' +
        'const PRECACHE = ["/Dividenden-Tracker/assets/index-AbC123.js",' +
        '"/Dividenden-Tracker/assets/client-XyZ.js",' +
        '"/Dividenden-Tracker/assets/index-Css9.css"];\n',
    );
  });

  it("bricht den Build ab, statt einen unbrauchbaren Service Worker auszuliefern", () => {
    expect(() => injectServiceWorkerBuild("const BUILD_ID = 1;", INDEX_HTML)).toThrow(
      /Platzhalter/,
    );
    expect(() => injectServiceWorkerBuild(TEMPLATE, "<html></html>")).toThrow(
      /Einstiegsskript/,
    );
  });
});

describe("buildIdOf", () => {
  it("nimmt den Dateinamen samt Hash, unabhaengig vom Basis-Pfad", () => {
    expect(buildIdOf("/Dividenden-Tracker/assets/index-AbC123.js")).toBe(
      "index-AbC123.js",
    );
    expect(buildIdOf("/assets/index-AbC123.js")).toBe("index-AbC123.js");
  });
});
