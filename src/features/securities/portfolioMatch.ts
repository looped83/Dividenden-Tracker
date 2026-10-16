/**
 * Zuordnung der Exportzeilen zu den eigenen Unternehmen und Ableitung der
 * vorgeschlagenen Stammdatenaenderungen (docs/PORTFOLIO_IMPORT.md).
 *
 * Reine Funktionen ohne Bezug zur Oberflaeche — dieselbe Trennung wie
 * `lib/import/matchCompany`, damit die Regeln einzeln pruefbar bleiben.
 *
 * Reihenfolge der Zuordnung wie in IMPORT_SPEC.md §4: **ISIN vor WKN vor Ticker
 * vor Name**. Die ersten drei sind Kennungen und damit eindeutig; beim Namen
 * uebernimmt `matchCompany` die vorhandene Zurueckhaltung — nur exakte Treffer
 * und bestaetigte Schreibweisen ordnen automatisch zu, aehnliche Namen nie.
 *
 * Der **Name wird niemals** zur Aenderung vorgeschlagen. Im Bestand steht die
 * gewachsene Schreibweise, an der auch die Namensangleichung des Kalenders
 * haengt (`lib/calendar/companyNames.ts`); die Quelle schreibt ETFs in voller
 * Laenge aus. Ein Import, der das ueberschreibt, zerlegt beides auf einmal.
 */
import { matchCompany, type ExistingAlias } from "@/lib/import/matchCompany";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { DivvyDiaryPosition } from "@/features/securities/divvydiaryCsv";

/** Woran die Zeile erkannt wurde — sichtbar in der Vorschau. */
export type MatchKind = "isin" | "wkn" | "ticker" | "name" | "alias" | "none";

export const MATCH_LABELS: Readonly<Record<MatchKind, string>> = {
  isin: "ISIN",
  wkn: "WKN",
  ticker: "Ticker",
  name: "Name",
  alias: "Schreibweise",
  none: "neu",
};

/** Stammdatenfelder, die aus dem Export gefuellt werden koennen. */
export type SecurityField = "isin" | "ticker" | "wkn" | "country" | "sector" | "currency";

export const FIELD_LABELS: Readonly<Record<SecurityField, string>> = {
  isin: "ISIN",
  ticker: "Ticker",
  wkn: "WKN",
  country: "Land",
  sector: "Branche",
  currency: "Währung",
};

/**
 * Felder, die nur **gefuellt**, nie geaendert werden.
 *
 * Die ISIN ist die Identitaet des Papiers: Sie traegt die Zuordnung dieses
 * Imports, die Namensangleichung des Kalenders und einen eindeutigen Index in
 * der Datenbank. Eine leere ISIN zu ergaenzen ist eine Vervollstaendigung; eine
 * vorhandene zu ersetzen hiesse „das ist ein anderes Wertpapier" — das gehoert
 * ins Bearbeitungsformular, wo es einer bewusst tut, nicht in einen
 * Sammelschalter.
 */
const FILL_ONLY_FIELDS = new Set<SecurityField>(["isin"]);

export interface FieldChange {
  field: SecurityField;
  /** Bisheriger Wert; `null`, wenn das Feld leer ist. */
  from: string | null;
  to: string;
}

export interface MatchedPosition {
  position: DivvyDiaryPosition;
  /** `null`, wenn die Zeile zu keinem angelegten Unternehmen passt. */
  securityId: string | null;
  /** Name des getroffenen Unternehmens — die eigene Schreibweise. */
  securityName: string | null;
  matchKind: MatchKind;
  /** Vorgeschlagene Stammdatenaenderungen; leer, wenn nichts zu ergaenzen ist. */
  changes: FieldChange[];
  /** Das getroffene Unternehmen ist archiviert, haelt laut Datei aber Bestand. */
  archived: boolean;
}

function normalizeKey(value: string | null): string | null {
  const trimmed = value?.trim().toUpperCase() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Index ueber eine Kennung. Aktive Unternehmen haben Vorrang vor archivierten;
 * ist eine Kennung mehrfach aktiv vergeben, bleibt sie ungenutzt — eine
 * mehrdeutige Zuordnung ist keine.
 */
function indexBy(
  securities: readonly Security[],
  pick: (security: Security) => string | null,
): Map<string, Security> {
  const buckets = new Map<string, Security[]>();
  for (const security of securities) {
    const key = normalizeKey(pick(security));
    if (key === null) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(security);
    else buckets.set(key, [security]);
  }

  const index = new Map<string, Security>();
  for (const [key, bucket] of buckets) {
    const active = bucket.filter((security) => !security.archived_at);
    const candidates = active.length > 0 ? active : bucket;
    if (candidates.length === 1) index.set(key, candidates[0]);
  }
  return index;
}

/**
 * Vorgeschlagene Aenderungen an den Stammdaten.
 *
 * Nur **fuellen und berichtigen**, nie leeren: Liefert die Quelle zu einem Feld
 * nichts, bleibt der vorhandene Wert unangetastet. Was der Nutzer gepflegt hat,
 * ist mehr wert als das Schweigen einer fremden Datei.
 */
export function fieldChanges(
  security: Security,
  position: DivvyDiaryPosition,
): FieldChange[] {
  const candidates: { field: SecurityField; from: string | null; to: string | null }[] = [
    { field: "isin", from: security.isin, to: position.isin },
    { field: "ticker", from: security.ticker, to: position.ticker },
    { field: "wkn", from: security.wkn, to: position.wkn },
    { field: "country", from: security.country, to: position.country },
    { field: "sector", from: security.sector, to: position.sector },
    // Die **Ausschuettungswaehrung** des Papiers, nicht die Depotwaehrung der
    // Zeile: `securities.currency` beschreibt laut DATA_DICTIONARY.md die
    // uebliche Waehrung der Ausschuettung.
    { field: "currency", from: security.currency, to: position.dividendCurrency },
  ];

  return candidates.filter(
    (candidate): candidate is FieldChange =>
      candidate.to !== null &&
      candidate.to !== candidate.from &&
      !(FILL_ONLY_FIELDS.has(candidate.field) && candidate.from !== null),
  );
}

/**
 * Ordnet die Zeilen des Exports den eigenen Unternehmen zu.
 *
 * @param aliases Beim Import bestaetigte Schreibweisen (`security_aliases`).
 */
export function matchPositions(
  positions: readonly DivvyDiaryPosition[],
  securities: readonly Security[],
  aliases: readonly ExistingAlias[] = [],
): MatchedPosition[] {
  const byIsin = indexBy(securities, (security) => security.isin);
  const byWkn = indexBy(securities, (security) => security.wkn);
  const byTicker = indexBy(securities, (security) => security.ticker);
  const forNameMatch = securities.map((security) => ({
    id: security.id,
    name: security.name,
    isin: security.isin,
    wkn: security.wkn,
    archived: Boolean(security.archived_at),
  }));

  return positions.map((position) => {
    let security: Security | undefined;
    let matchKind: MatchKind = "none";

    security = byIsin.get(position.isin);
    if (security) matchKind = "isin";

    if (!security && position.wkn !== null) {
      security = byWkn.get(position.wkn);
      if (security) matchKind = "wkn";
    }
    if (!security && position.ticker !== null) {
      security = byTicker.get(normalizeKey(position.ticker) ?? "");
      if (security) matchKind = "ticker";
    }
    if (!security) {
      const byName = matchCompany(position.name, forNameMatch, [...aliases]);
      if (byName.autoAssignable && byName.securityId !== null) {
        security = securities.find((entry) => entry.id === byName.securityId);
        if (security) matchKind = byName.reason === "alias" ? "alias" : "name";
      }
    }

    if (!security) {
      return {
        position,
        securityId: null,
        securityName: null,
        matchKind: "none",
        changes: [],
        archived: false,
      };
    }

    return {
      position,
      securityId: security.id,
      securityName: security.name,
      matchKind,
      changes: fieldChanges(security, position),
      archived: Boolean(security.archived_at),
    };
  });
}
