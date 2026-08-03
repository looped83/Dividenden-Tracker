/**
 * Strukturanalyse der Antworten (Auftrag Phase B0 §4, §6, §7).
 *
 * Der Zweck ist eng: herausfinden, **welche Felder** eine Antwort hat, welchen
 * **Typ** sie tragen und ob sich das Schema gegenueber dem Beleg **geaendert**
 * hat. Der Inhalt der Felder interessiert nicht und wird deshalb ueber
 * `describeValue` (sanitize.ts) auf seine Gestalt reduziert, bevor er in einen
 * Bericht kommt.
 *
 * Rein und ohne Laufzeitbezug, damit die Unit-Tests dieselbe Logik pruefen, die
 * das Skript verwendet.
 */

import { describeValue } from "./sanitize.ts";

export type BodyKind = "json" | "html" | "empty" | "other";

/**
 * Was fuer eine Antwort ist das? Der Content-Type ist ein Hinweis, kein Beweis:
 * Fehlerseiten kommen regelmaessig als `text/html` mit JSON-Koerper oder
 * umgekehrt. Deshalb entscheidet am Ende der Inhalt.
 */
export function classifyBody(contentType: string | null, body: string): BodyKind {
  const trimmed = body.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (/^<(!doctype|html)/i.test(trimmed)) return "html";
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "html";
  return "other";
}

export type JsonParse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

/** JSON lesen, ohne zu werfen. Die Fehlermeldung des Parsers kann Inhalte
 *  zitieren („Unexpected token … in JSON at position") und wird deshalb
 *  verworfen; die Position genuegt zur Fehlersuche nicht und schadet nur. */
export function parseJson(body: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, reason: "Antwort ist kein gueltiges JSON" };
  }
}

export interface FieldShape {
  /** Punktnotation; Arrays erscheinen als `feld[]`. */
  readonly path: string;
  /** Gestalt des Werts, niemals der Wert selbst. */
  readonly type: string;
}

/** Wie tief die Struktur verfolgt wird — genug fuer `portfolios[].positions[].isin`. */
const MAX_DEPTH = 4;
/** Wie viele Elemente eines Arrays betrachtet werden. Mehr bringt keine neuen Felder. */
const ARRAY_SAMPLE = 3;

/**
 * Beschreibt die Struktur eines JSON-Werts als flache, sortierte Feldliste.
 * Arrays werden zusammengefasst: Aus drei Positionen mit denselben Feldern wird
 * ein Eintrag `positions[].isin` — der Bericht bleibt lesbar und enthaelt
 * dennoch jedes beobachtete Feld.
 */
export function describeShape(value: unknown): readonly FieldShape[] {
  const found = new Map<string, Set<string>>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;

    if (Array.isArray(node)) {
      record(found, path, `array[${String(node.length)}]`);
      for (const item of node.slice(0, ARRAY_SAMPLE)) {
        walk(item, `${path}[]`, depth + 1);
      }
      return;
    }

    if (node !== null && typeof node === "object") {
      if (path !== "") record(found, path, describeValue(node));
      for (const [key, child] of Object.entries(node)) {
        walk(child, path === "" ? key : `${path}.${key}`, depth + 1);
      }
      return;
    }

    record(found, path === "" ? "<root>" : path, describeValue(node));
  };

  walk(value, "", 0);

  return [...found.entries()]
    .map(([path, types]) => ({ path, type: [...types].sort().join(" | ") }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function record(map: Map<string, Set<string>>, path: string, type: string): void {
  const existing = map.get(path);
  if (existing) existing.add(type);
  else map.set(path, new Set([type]));
}

/**
 * Die Felder, die aus den Belegen bekannt sind (endpoints.ts). Weichen die
 * tatsaechlichen Antworten davon ab, hat sich das Schema geaendert — die
 * wichtigste Einzelinformation fuer die Stabilitaetsbewertung.
 */
export const EXPECTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  session: ["portfolios", "portfolios[].id", "portfolios[].name"],
  symbol: [
    "isin",
    "wkn",
    "symbol",
    "name",
    "exchange",
    "currency",
    "dividendCurrency",
    "dividendFrequency",
    "dividends",
    "dividends[].exDate",
    "dividends[].payDate",
    "dividends[].amount",
    "dividends[].currency",
  ],
};

export interface ShapeComparison {
  /** Belegte Felder, die die Antwort nicht mehr enthaelt. */
  readonly missing: readonly string[];
  /** Felder der Antwort, die in keinem Beleg vorkommen — moegliche Neuerungen. */
  readonly additional: readonly string[];
}

export function compareWithExpected(
  endpointId: string,
  shape: readonly FieldShape[],
): ShapeComparison {
  const expected = EXPECTED_FIELDS[endpointId] ?? [];
  const actual = new Set(shape.map((field) => field.path));
  return {
    missing: expected.filter((path) => !actual.has(path)),
    additional: shape
      .map((field) => field.path)
      .filter((path) => expected.length > 0 && !expected.includes(path)),
  };
}

/**
 * Die Kernfrage der Phase B0: Enthaelt eine Antwort ueberhaupt Bestandsdaten?
 *
 * Gesucht wird nicht nach geratenen Endpunkten, sondern in dem, was
 * tatsaechlich zurueckkam — nach Feldnamen, die eine Position ausmachen.
 * Ein Treffer ist ein **Hinweis**, kein Beweis: `quantity` kann auch in einer
 * Beispielantwort der Swagger-Seite stehen. Die Bewertung bleibt beim Menschen.
 */
const POSITION_SIGNALS: readonly { readonly label: string; readonly pattern: RegExp }[] =
  [
    { label: "Stueckzahl", pattern: /(^|\.)(quantity|shares|amountOfShares|units)$/i },
    {
      label: "Einstand",
      pattern: /(^|\.)(buyin|costBasis|averagePrice|purchasePrice)$/i,
    },
    { label: "Marktwert", pattern: /(^|\.)(marketValue|value|totalValue)$/i },
    { label: "Kurs", pattern: /(^|\.)(price|quote|lastPrice)$/i },
    { label: "Positionsliste", pattern: /(^|\.)(positions|holdings|securities|items)$/i },
    { label: "Gewichtung", pattern: /(^|\.)(weight|allocation|share)$/i },
    { label: "Rendite", pattern: /(^|\.)(yield|yieldOnCost|dividendYield)$/i },
  ];

export interface PositionSignal {
  readonly label: string;
  readonly path: string;
}

export function findPositionSignals(
  shape: readonly FieldShape[],
): readonly PositionSignal[] {
  const hits: PositionSignal[] = [];
  for (const field of shape) {
    for (const signal of POSITION_SIGNALS) {
      if (signal.pattern.test(field.path))
        hits.push({ label: signal.label, path: field.path });
    }
  }
  return hits;
}
