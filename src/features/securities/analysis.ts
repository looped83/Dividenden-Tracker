/**
 * Aufschluesselung des juengsten Depotstands (Bestand › Analyse).
 *
 * Reine Funktionen wie `snapshots.ts`: ohne Oberflaeche, ohne Datenbank. Die
 * Grundlage ist ausschliesslich der zuletzt importierte Depotstand — Marktdaten
 * und *erwartete* Ausschuettungen einer fremden Quelle. Nichts davon fliesst in
 * Statistik oder Ziele (PRODUCT_SPEC.md Grundsatz 8).
 *
 * Jede Aufteilung beantwortet dieselbe Frage fuer eine andere Eigenschaft: Wie
 * verteilt sich der Depotwert — oder die erwartete Jahresdividende — darauf?
 * Beide Groessen fallen oft auseinander, und genau das ist der Erkenntnisgewinn
 * des Umschalters: Eine Branche kann ein Zehntel des Werts stellen und ein
 * Viertel der Dividende.
 */
import {
  Money,
  MoneyDecimal,
  toCurrencyCode,
  type CurrencyCode,
  type DecimalInstance,
} from "@/lib/money";
import type { DividendFrequency, SecurityAssetType } from "@/lib/supabase/database.types";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "./snapshots";

/** Bezugsgroesse aller Anteile; der Wert steht so in der Adresse (`?nach=`). */
export type AnalysisMeasure = "wert" | "dividende";

/** Stammdaten, die der Depotstand selbst nicht traegt. */
export interface AnalysisFacets {
  name: string;
  sector: string | null;
  /** ISO-3166-Code (`US`). */
  country: string | null;
  /** Ausschuettungswaehrung des Papiers — nicht die Depotwaehrung des Exports. */
  currency: string | null;
  /** Gepflegte Ausschuettungsmonate (1–12); leer, wenn nicht gepflegt. */
  payoutMonths: readonly number[];
}

/** Ein Anteil am Ganzen. */
export interface AnalysisSlice {
  /** Stabiler Schluessel; {@link UNKNOWN_KEY} fuer „ohne Angabe". */
  key: string;
  label: string;
  amount: Money;
  /** Anteil an der Gesamtsumme in Prozentpunkten. */
  share: DecimalInstance;
  positions: number;
  /** Die Positionen dahinter, groesster Betrag zuerst (zum Aufklappen). */
  holdings: AnalysisHolding[];
}

/** Eine Position innerhalb eines Anteils. */
export interface AnalysisHolding {
  securityId: string;
  name: string;
  amount: Money;
  /** Anteil an der Gesamtsumme in Prozentpunkten. */
  share: DecimalInstance;
}

export interface PortfolioAnalysis {
  asOf: string;
  total: Money;
  /** Positionen im juengsten Stand. */
  positions: number;
  /** Positionen, fuer die die Quelle zur Bezugsgroesse keinen Betrag nennt. */
  withoutAmount: number;
  assetTypes: AnalysisSlice[];
  currencies: AnalysisSlice[];
  frequencies: AnalysisSlice[];
  sectors: AnalysisSlice[];
  countries: AnalysisSlice[];
}

export type AnalysisResult =
  | { kind: "ok"; analysis: PortfolioAnalysis }
  /** Kein Depotstand importiert — oder keiner mit einem Betrag. */
  | { kind: "empty" }
  /** Betraege verschiedener Waehrungen werden nicht addiert (snapshots.ts). */
  | { kind: "mixedCurrency" };

export const UNKNOWN_KEY = "";
export const OTHER_KEY = "__other";

/** Hoechstens so viele Ringstuecke; der Rest wird „Sonstige". */
const RING_SLICES = 5;

const HUNDRED = new MoneyDecimal(100);

const ASSET_TYPE_LABELS: Readonly<Record<SecurityAssetType, string>> = {
  equity: "Aktien",
  etf: "ETFs",
  fund: "Fonds",
  crypto: "Krypto",
  other: "Sonstige",
};

export const FREQUENCY_LABELS: Readonly<Record<DividendFrequency, string>> = {
  none: "keine Ausschüttung",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  biannually: "halbjährlich",
  annually: "jährlich",
  irregular: "unregelmäßig",
};

const FREQUENCY_BY_MONTH_COUNT: Readonly<Record<number, DividendFrequency>> = {
  1: "annually",
  2: "biannually",
  4: "quarterly",
  12: "monthly",
};

/**
 * Rhythmus einer Position: Gepflegte Ausschuettungsmonate gehen dem Export vor.
 * DivvyDiary leitet den Rhythmus aus der bisherigen Historie ab und nennt bei
 * einem jungen Papier mit erst einer Zahlung „jaehrlich", obwohl es
 * vierteljaehrlich ausschuettet. Die Monate pflegt der Nutzer selbst, sie sind
 * die bessere Quelle. „Keine Ausschuettung" laut Export bleibt stehen — dann
 * zahlt das Papier derzeit nicht, egal was die Stammdaten sagen. Eine Anzahl
 * Monate ohne festen Rhythmus (z. B. drei) laesst den Export stehen.
 */
export function effectiveFrequency(
  exported: DividendFrequency | null,
  payoutMonths: readonly number[],
): DividendFrequency | null {
  if (exported === "none") return exported;
  return FREQUENCY_BY_MONTH_COUNT[payoutMonths.length] ?? exported;
}

let countryNames: Intl.DisplayNames | null | undefined;

/** „US" → „Vereinigte Staaten"; der Code selbst, wo der Browser ihn nicht kennt. */
/**
 * Codes, die Laenderfeld und ISIN-Praefix teilen, aber kein Land sind. „XS"
 * traegt jedes international ueber Euroclear/Clearstream begebene Papier
 * (Anleihen, ETCs/ETPs); beim Import landet das ISIN-Praefix dann als Land.
 */
const NON_COUNTRY_LABELS: Readonly<Record<string, string>> = {
  XS: "International (XS)",
};

function countryLabel(code: string): string {
  const special = NON_COUNTRY_LABELS[code];
  if (special) return special;
  if (countryNames === undefined) {
    try {
      countryNames = new Intl.DisplayNames(["de"], { type: "region" });
    } catch {
      countryNames = null;
    }
  }
  try {
    return countryNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function normalizedCountry(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? UNKNOWN_KEY;
}

function capitalized(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Eine Zeile des Stands mit ihrem Betrag zur gewaehlten Bezugsgroesse. */
interface Entry {
  row: SecuritySnapshot;
  amount: Money | null;
}

function isPositive(value: string | null): boolean {
  return value !== null && new MoneyDecimal(value).greaterThan(0);
}

function sumEntries(entries: readonly Entry[], currency: CurrencyCode): Money {
  return entries.reduce(
    (sum, entry) => (entry.amount ? sum.add(entry.amount) : sum),
    Money.zero(currency),
  );
}

/**
 * Fasst Eintraege nach einem Schluessel zusammen. Stuecke ohne Betrag (ein
 * Thesaurierer bei „Dividende") fallen weg — ein Ringstueck von null Prozent
 * ist keine Auskunft. „ohne Angabe" steht am Ende, egal wie gross: Es ist keine
 * Kategorie, sondern das Fehlen einer.
 */
function group(
  entries: readonly Entry[],
  total: Money,
  keyOf: (row: SecuritySnapshot) => string,
  labelOf: (key: string) => string,
  nameOf: (securityId: string) => string,
): AnalysisSlice[] {
  const shareOf = (amount: Money) =>
    amount.toDecimal().dividedBy(total.toDecimal()).times(HUNDRED);
  const buckets = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = keyOf(entry.row);
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const slices: AnalysisSlice[] = [];
  for (const [key, list] of buckets) {
    const amount = list.reduce(
      (sum, entry) => (entry.amount ? sum.add(entry.amount) : sum),
      Money.zero(total.currency),
    );
    if (amount.isZero()) continue;
    const holdings: AnalysisHolding[] = [];
    for (const entry of list) {
      if (!entry.amount || entry.amount.isZero()) continue;
      holdings.push({
        securityId: entry.row.security_id,
        name: nameOf(entry.row.security_id),
        amount: entry.amount,
        share: shareOf(entry.amount),
      });
    }
    holdings.sort((a, b) => b.amount.compareTo(a.amount));
    slices.push({
      key,
      label: key === UNKNOWN_KEY ? "ohne Angabe" : labelOf(key),
      amount,
      share: shareOf(amount),
      positions: list.length,
      holdings,
    });
  }
  return sortSlices(slices);
}

function sortSlices(slices: AnalysisSlice[]): AnalysisSlice[] {
  return slices.sort((a, b) => {
    if (a.key === UNKNOWN_KEY) return 1;
    if (b.key === UNKNOWN_KEY) return -1;
    return b.amount.compareTo(a.amount);
  });
}

/**
 * Kuerzt eine Aufteilung fuer den Ring auf {@link RING_SLICES} Stuecke: Mehr
 * Abstufungen einer Farbe kann niemand auseinanderhalten. Die kleinsten
 * Kategorien gehen in „Sonstige" auf; „ohne Angabe" bleibt eigenes Stueck.
 */
export function collapseSlices(
  slices: readonly AnalysisSlice[],
  max = RING_SLICES,
): AnalysisSlice[] {
  if (slices.length <= max) return [...slices];
  const unknown = slices.find((slice) => slice.key === UNKNOWN_KEY);
  const known = slices.filter((slice) => slice.key !== UNKNOWN_KEY);
  const keep = known.slice(0, max - 1 - (unknown ? 1 : 0));
  const rest = known.slice(keep.length);
  const other: AnalysisSlice = {
    key: OTHER_KEY,
    label: "Sonstige",
    amount: rest.reduce(
      (sum, slice) => sum.add(slice.amount),
      Money.zero(rest[0].amount.currency),
    ),
    share: rest.reduce((sum, slice) => sum.plus(slice.share), new MoneyDecimal(0)),
    positions: rest.reduce((sum, slice) => sum + slice.positions, 0),
    holdings: rest.flatMap((slice) => slice.holdings),
  };
  return [...keep, other, ...(unknown ? [unknown] : [])];
}

/**
 * Schluesselt den juengsten Depotstand nach Asset-Typ, Waehrung, Rhythmus,
 * Branche und Land auf.
 *
 * @param facets Branche, Land und Waehrung je Unternehmen aus den Stammdaten.
 */
export function analyzePortfolio(
  snapshots: readonly SecuritySnapshot[],
  facets: ReadonlyMap<string, AnalysisFacets>,
  measure: AnalysisMeasure,
): AnalysisResult {
  const asOf = latestAsOf(snapshots);
  const rows = snapshotsAt(snapshots, asOf);
  if (asOf === null || rows.length === 0) return { kind: "empty" };

  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size > 1) return { kind: "mixedCurrency" };
  const currency = toCurrencyCode(rows[0].currency);

  const entries: Entry[] = rows.map((row) => {
    const raw = measure === "wert" ? row.market_value : row.annual_dividend_total;
    return { row, amount: raw === null ? null : Money.fromString(raw, currency) };
  });
  const total = sumEntries(entries, currency);
  if (total.isZero()) return { kind: "empty" };

  const facetOf = (row: SecuritySnapshot) => facets.get(row.security_id);
  const nameOf = (securityId: string) => facets.get(securityId)?.name ?? "Unbekannt";
  const frequencyOf = (row: SecuritySnapshot) =>
    effectiveFrequency(row.dividend_frequency, facetOf(row)?.payoutMonths ?? []);
  /**
   * Rhythmus nur fuer Positionen, die tatsaechlich ausschuetten: „keine
   * Ausschuettung", eine fehlende Angabe und eine erwartete Dividende von 0 €
   * (eine ausgesetzte Zahlung) sind kein Rhythmus. Die Anteile
   * beziehen sich deshalb auf die Summe dieser Positionen, damit der Ring
   * aufgeht.
   */
  const payers = entries.filter((entry) => {
    const frequency = frequencyOf(entry.row);
    return (
      frequency !== null &&
      frequency !== "none" &&
      isPositive(entry.row.annual_dividend_total)
    );
  });
  const payersTotal = sumEntries(payers, currency);

  return {
    kind: "ok",
    analysis: {
      asOf,
      total,
      positions: rows.length,
      withoutAmount: entries.filter((entry) => entry.amount === null).length,
      assetTypes: group(
        entries,
        total,
        (row) => row.asset_type ?? UNKNOWN_KEY,
        (key) => ASSET_TYPE_LABELS[key as SecurityAssetType],
        nameOf,
      ),
      currencies: group(
        entries,
        total,
        (row) => facetOf(row)?.currency?.trim().toUpperCase() ?? UNKNOWN_KEY,
        (key) => key,
        nameOf,
      ),
      frequencies: payersTotal.isZero()
        ? []
        : group(
            payers,
            payersTotal,
            (row) => frequencyOf(row) ?? UNKNOWN_KEY,
            (key) => capitalized(FREQUENCY_LABELS[key as DividendFrequency]),
            nameOf,
          ),
      sectors: group(
        entries,
        total,
        (row) => facetOf(row)?.sector?.trim() ?? UNKNOWN_KEY,
        (key) => key,
        nameOf,
      ),
      countries: group(
        entries,
        total,
        (row) => normalizedCountry(facetOf(row)?.country),
        countryLabel,
        nameOf,
      ),
    },
  };
}
