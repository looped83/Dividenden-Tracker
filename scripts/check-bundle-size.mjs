// Groessenbudget fuer das gebaute Bundle (gzip, wie es uebers Netz geht).
//
// Laeuft nach `npm run build` in der CI und schlaegt fehl, sobald ein Teil
// merklich waechst. Gemessen wird, was die Ladezeit bestimmt:
// - der Start: alles, was `index.html` sofort laedt (Skripte, Vorladen, CSS),
// - jedes nachgeladene Stueck einzeln; Diagramme haben eine
//   eigene, groessere Grenze, weil sie bewusst erst bei Bedarf kommen.
//
// Die Grenzen liegen rund 10 % ueber dem Stand bei ihrer Einfuehrung. Waechst
// ein Teil gewollt, hebt man hier die Grenze an und schreibt den Grund in den
// Commit — so bleibt jede Vergroesserung eine Entscheidung.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGETS = {
  // Stand 1.18.0: 201,5 kB
  initial: 220 * KB,
  // Stand 1.18.0: 104,9 kB
  charts: 115 * KB,
  // Groesstes uebriges Stueck, Stand 1.18.0: 17,8 kB
  otherChunk: 25 * KB,
};

const dist = process.argv[2] ?? "dist";
const assets = join(dist, "assets");
const gzipSize = (file) => gzipSync(readFileSync(join(assets, file))).length;
const format = (bytes) => `${(bytes / KB).toFixed(1)} kB`;

const html = readFileSync(join(dist, "index.html"), "utf8");
const initialFiles = new Set(
  [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]),
);

const results = [];
const initial = [...initialFiles].reduce((sum, file) => sum + gzipSize(file), 0);
results.push({ name: "Start (index.html)", size: initial, budget: BUDGETS.initial });

for (const file of readdirSync(assets)) {
  if (!file.endsWith(".js") || initialFiles.has(file)) continue;
  const group = file.startsWith("charts-") ? "charts" : "otherChunk";
  results.push({ name: file, size: gzipSize(file), budget: BUDGETS[group] });
}

const over = results.filter((r) => r.size > r.budget);
const largest = [...results].sort((a, b) => b.size - a.size).slice(0, 5);
for (const r of largest) {
  console.log(`${r.name.padEnd(40)} ${format(r.size).padStart(9)} / ${format(r.budget)}`);
}
if (over.length > 0) {
  console.error("\nUeber dem Budget:");
  for (const r of over)
    console.error(`  ${r.name}: ${format(r.size)} > ${format(r.budget)}`);
  process.exit(1);
}
console.log("\nAlle Teile im Budget.");
