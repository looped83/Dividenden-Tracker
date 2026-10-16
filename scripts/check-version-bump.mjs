// Prueft, dass ein Pull Request, der die ausgelieferte App veraendert, die
// Versionsnummer in package.json anhebt (DECISIONS.md ADR-004).
//
// Aufruf: node scripts/check-version-bump.mjs <basis-ref>   (z. B. origin/main)
//
// Verglichen wird mit dem **aktuellen Stand** der Basis, nicht mit dem
// Abzweigpunkt: Zwei offene PRs, die beide 1.5.0 → 1.5.1 heben, duerfen nicht
// beide durchgehen — der zweite muss nach dem ersten auf 1.5.2.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";

// Was Nutzer erreicht. Tests, Doku, CI und Abhaengigkeiten allein heben die
// Fassung nicht — sie gehen mit der naechsten Aenderung an der App hinaus.
const APP_PATHS = ["src/", "public/", "supabase/", "index.html"];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/** "1.5.0" → [1, 5, 0]; alles andere ist ein Fehler, keine stille Null. */
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Keine gültige Versionsnummer: "${version}"`);
  return match.slice(1).map(Number);
}

function isGreater(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

const changed = git("diff", "--name-only", `${base}...HEAD`)
  .split("\n")
  .filter((file) => APP_PATHS.some((path) => file === path || file.startsWith(path)));

if (changed.length === 0) {
  console.log("Keine Änderung an der App — Versionsnummer bleibt.");
  process.exit(0);
}

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const previous = JSON.parse(git("show", `${base}:package.json`)).version;

if (isGreater(parse(current), parse(previous))) {
  console.log(`Version ${previous} → ${current}`);
  process.exit(0);
}

console.error(
  [
    `Die App ändert sich (${String(changed.length)} Dateien, z. B. ${changed[0]}),`,
    `die Version bleibt aber bei ${current} (Basis: ${previous}).`,
    "Anheben mit: npm version <patch|minor|major> --no-git-tag-version",
  ].join("\n"),
);
process.exit(1);
