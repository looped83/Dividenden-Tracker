import type { AssetRow } from "@/features/securities/assetRows";
import { compareGermanLoose } from "@/lib/utils/compareText";

/**
 * Sortierung der Assetliste — dasselbe Muster wie in der Dividendenliste
 * (`payments/sortRows.ts`): rein, stabil und ohne Bezug zur Oberflaeche, damit
 * sie sich einzeln pruefen laesst.
 *
 * **Leere Felder stehen immer am Ende**, in beiden Richtungen: Ein Asset ohne
 * Ticker ist keine Antwort auf „sortiere nach Ticker" — weder die kleinste noch
 * die groesste. Dasselbe gilt fuer Positionszahlen: Ein Papier ohne Bestand im
 * juengsten Depotstand ist kein Depotwert von 0, sondern gar keiner. Bei
 * Gleichstand entscheidet der Name.
 */
export type SecurityTextSortField = "name" | "ticker" | "sector" | "country" | "depot";
/** Felder aus dem juengsten Depotstand — nur waehlbar, wenn einer vorliegt. */
export type SecurityPositionSortField = "value" | "expected" | "yield" | "gain";
export type SecuritySortField = SecurityTextSortField | SecurityPositionSortField;
export type SortDirection = "asc" | "desc";

export interface SecuritySort {
  field: SecuritySortField;
  direction: SortDirection;
}

export interface SecuritySortOption {
  value: SecuritySortField;
  label: string;
}

/** Beschriftungen der Auswahl; sie benennen die Sortierung selbst. */
export const SECURITY_SORT_FIELDS: readonly SecuritySortOption[] = [
  { value: "name", label: "Nach Name" },
  { value: "ticker", label: "Nach Ticker" },
  { value: "sector", label: "Nach Branche" },
  { value: "country", label: "Nach Land" },
  // „Nach Depot": Die Liste kennt nur ein Depot je Asset — das Standard-Depot —,
  // und „Nach Standard-Depot" fuellte die Auswahl mit einem Wort, das an dieser
  // Stelle nichts unterscheidet.
  { value: "depot", label: "Nach Depot" },
];

/**
 * Sortierungen, die den Depotstand brauchen. Sie stehen **vor** den
 * Stammdatenfeldern: Liegt ein Stand vor, sind Wert und Ausschuettung die
 * Fragen an diese Liste, nicht die Schreibweise des Tickers.
 */
export const SECURITY_POSITION_SORT_FIELDS: readonly SecuritySortOption[] = [
  { value: "value", label: "Nach Wert" },
  { value: "expected", label: "Nach Erwartet p. a." },
  { value: "yield", label: "Nach Rendite" },
  { value: "gain", label: "Nach Gewinn" },
];

const POSITION_FIELDS = new Set<SecuritySortField>(
  SECURITY_POSITION_SORT_FIELDS.map((option) => option.value),
);

export function isPositionSortField(
  field: SecuritySortField,
): field is SecurityPositionSortField {
  return POSITION_FIELDS.has(field);
}

/**
 * Die waehlbaren Sortierungen. Ohne Depotstand entfallen die Positionsfelder —
 * eine Auswahl, die nichts umsortiert, ist ein leeres Versprechen.
 */
export function securitySortOptions(
  withPositions: boolean,
): readonly SecuritySortOption[] {
  return withPositions
    ? [...SECURITY_POSITION_SORT_FIELDS, ...SECURITY_SORT_FIELDS]
    : SECURITY_SORT_FIELDS;
}

export const DEFAULT_SECURITY_SORT: SecuritySort = { field: "name", direction: "asc" };

/**
 * Richtung, die zu einem frisch gewaehlten Feld gehoert: Zahlen zuerst gross
 * („welche Position ist die groesste?"), Text von A nach Z. Wer es anders will,
 * dreht die Richtung — die Vorgabe soll nur der haeufigste Fall sein.
 */
export function defaultDirectionFor(field: SecuritySortField): SortDirection {
  return isPositionSortField(field) ? "desc" : "asc";
}

/** Stammdatenfeld als Text; Leerstrings zaehlen wie „nicht gesetzt". */
function textValue(row: AssetRow, field: SecurityTextSortField): string | null {
  const value = (() => {
    switch (field) {
      case "ticker":
        return row.security.ticker;
      case "sector":
        return row.security.sector;
      case "country":
        return row.security.country;
      case "depot":
        return row.depotName;
      case "name":
        return row.security.name;
    }
  })();
  return value === null || value === "" ? null : value;
}

/**
 * Zahlenwert einer Positionsspalte.
 *
 * Betraege werden ueber `toChartNumber()` verglichen — das ergibt eine
 * Reihenfolge, keine Rechnung: Es entsteht kein Betrag, der irgendwo angezeigt
 * wuerde (CALCULATION_RULES.md §8). Waehrungen bleiben dabei unbeachtet, wie
 * schon in der Unternehmensstatistik; eine gemischte Liste laesst sich sonst
 * gar nicht ordnen.
 */
function numberValue(row: AssetRow, field: SecurityPositionSortField): number | null {
  const position = row.position;
  if (position === null) return null;
  switch (field) {
    case "value":
      return position.marketValue?.toChartNumber() ?? null;
    case "expected":
      return position.annualDividend?.toChartNumber() ?? null;
    case "yield":
      return position.dividendYield?.toNumber() ?? null;
    case "gain":
      return position.gain?.toChartNumber() ?? null;
  }
}

/**
 * Vergleich zweier Werte, die fehlen duerfen: Fehlende stehen **immer** am
 * Ende — der Richtungsfaktor wirkt nur auf zwei vorhandene Werte.
 */
function compareNullable<T>(
  left: T | null,
  right: T | null,
  factor: number,
  compare: (a: T, b: T) => number,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return compare(left, right) * factor;
}

/** Sortiert die Zeilen der Assetliste. Die Eingabe bleibt unveraendert. */
export function sortAssetRows(rows: readonly AssetRow[], sort: SecuritySort): AssetRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  const field = sort.field;
  const compareField = isPositionSortField(field)
    ? (a: AssetRow, b: AssetRow) =>
        compareNullable(numberValue(a, field), numberValue(b, field), factor, (x, y) =>
          x === y ? 0 : x < y ? -1 : 1,
        )
    : (a: AssetRow, b: AssetRow) =>
        compareNullable(
          textValue(a, field),
          textValue(b, field),
          factor,
          compareGermanLoose,
        );

  return [...rows].sort((a, b) => {
    const primary = compareField(a, b);
    // Bei Gleichstand entscheidet der Name — sonst haenge die Reihenfolge vom
    // Zufall der Eingabe ab.
    return primary !== 0 ? primary : compareGermanLoose(a.security.name, b.security.name);
  });
}
