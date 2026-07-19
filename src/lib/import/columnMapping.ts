/**
 * Spaltenmapping-Vorschlaege per Synonym-Woerterbuch (IMPORT_SPEC.md §4,
 * Task-Spezifikation §4). Die Vorschlaege sind vor dem Import sichtbar und
 * manuell aenderbar; Pflichtfelder sind Datum, Unternehmen, Betrag, Broker.
 */

export type TargetField = "pay_date" | "security" | "net_amount" | "broker";

export const REQUIRED_FIELDS: TargetField[] = [
  "pay_date",
  "security",
  "net_amount",
  "broker",
];

export const FIELD_LABELS: Record<TargetField, string> = {
  pay_date: "Zahlungsdatum",
  security: "Unternehmen / Wertpapier",
  net_amount: "Nettobetrag",
  broker: "Depot / Broker",
};

/** Synonyme je Zielfeld (kleingeschrieben, ohne Umlaut-Sonderbehandlung). */
const SYNONYMS: Record<TargetField, string[]> = {
  pay_date: [
    "datum",
    "date",
    "zahlungsdatum",
    "payment date",
    "buchungstag",
    "valuta",
    "zahltag",
    "pay date",
  ],
  security: [
    "investment",
    "unternehmen",
    "wertpapier",
    "security",
    "company",
    "name",
    "titel",
    "aktie",
    "position",
  ],
  net_amount: [
    "betrag",
    "netto",
    "nettobetrag",
    "amount",
    "net amount",
    "net",
    "dividend",
    "dividende",
    "auszahlung",
  ],
  broker: ["broker", "depot", "konto", "account", "portfolio", "bank"],
};

export type ColumnMapping = Partial<Record<TargetField, number>>;

/**
 * Schlaegt fuer jede Kopfzeile ein Zielfeld vor. Jede Quellspalte wird
 * hoechstens einem Zielfeld zugeordnet; jedes Zielfeld hoechstens einer Spalte.
 */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.normalize("NFC").trim().toLowerCase());
  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();

  // Exakte Treffer haben Vorrang vor Teiltreffern.
  for (const field of REQUIRED_FIELDS) {
    const exactIndex = normalized.findIndex(
      (h, i) => !usedColumns.has(i) && SYNONYMS[field].includes(h),
    );
    if (exactIndex !== -1) {
      mapping[field] = exactIndex;
      usedColumns.add(exactIndex);
    }
  }

  // Teiltreffer (enthaelt Synonym als Wort) fuer noch offene Pflichtfelder.
  for (const field of REQUIRED_FIELDS) {
    if (mapping[field] !== undefined) continue;
    const partialIndex = normalized.findIndex(
      (h, i) =>
        !usedColumns.has(i) &&
        SYNONYMS[field].some((syn) => h.includes(syn) || syn.includes(h)),
    );
    if (partialIndex !== -1) {
      mapping[field] = partialIndex;
      usedColumns.add(partialIndex);
    }
  }

  return mapping;
}

export function missingRequiredFields(mapping: ColumnMapping): TargetField[] {
  return REQUIRED_FIELDS.filter((field) => mapping[field] === undefined);
}
