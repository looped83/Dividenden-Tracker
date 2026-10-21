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
import { Money, MoneyDecimal, toCurrencyCode, type DecimalInstance } from "@/lib/money";
import type { DividendFrequency, SecurityAssetType } from "@/lib/supabase/database.types";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "./snapshots";

/** Bezugsgroesse aller Anteile; der Wert steht so in der Adresse (`?nach=`). */
export type AnalysisMeasure = "wert" | "dividende";

/** Stammdaten, die der Depotstand selbst nicht traegt. */
export interface AnalysisFacets {
  sector: string | null;
  /** ISO-3166-Code (`US`). */
  country: string | null;
  /** Ausschuettungswaehrung des Papiers — nicht die Depotwaehrung des Exports. */
  currency: string | null;
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
  /** Laender einer Region; sonst leer. */
  children: AnalysisSlice[];
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
  regions: AnalysisSlice[];
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

/**
 * Region je Land. Bewusst grob: Die Frage lautet „wie abhaengig bin ich von
 * einem Wirtschaftsraum?", nicht eine geografische Feinkarte. Die Laender
 * stehen aufklappbar darunter. Ein nicht aufgefuehrter Code landet in „Übrige
 * Welt" statt zu verschwinden.
 */
const REGIONS: readonly { key: string; label: string; countries: string }[] = [
  { key: "na", label: "Nordamerika", countries: "US CA BM PR" },
  {
    key: "eu",
    label: "Europa",
    countries:
      "AT BE BG CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MT NL NO PL PT RO SE SI SK TR",
  },
  {
    key: "ap",
    label: "Asien-Pazifik",
    countries: "AU CN HK ID IN JP KR MO MY NZ PH SG TH TW VN",
  },
  { key: "la", label: "Lateinamerika", countries: "AR BR BS CL CO KY MX PA PE UY VG" },
  {
    key: "mea",
    label: "Naher Osten & Afrika",
    countries: "AE EG IL KW MA NG QA SA ZA",
  },
];
const REST_OF_WORLD = { key: "rest", label: "Übrige Welt" };

const REGION_OF_COUNTRY = new Map(
  REGIONS.flatMap((region) =>
    region.countries.split(" ").map((code) => [code, region] as const),
  ),
);

const REGION_LABELS = new Map<string, string>([
  ...REGIONS.map((region) => [region.key, region.label] as const),
  [REST_OF_WORLD.key, REST_OF_WORLD.label],
]);

let countryNames: Intl.DisplayNames | null | undefined;

/** „US" → „Vereinigte Staaten"; der Code selbst, wo der Browser ihn nicht kennt. */
function countryLabel(code: string): string {
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
): AnalysisSlice[] {
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
    slices.push({
      key,
      label: key === UNKNOWN_KEY ? "ohne Angabe" : labelOf(key),
      amount,
      share: amount.toDecimal().dividedBy(total.toDecimal()).times(HUNDRED),
      positions: list.length,
      children: [],
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
    children: [],
  };
  return [...keep, other, ...(unknown ? [unknown] : [])];
}

/**
 * Schluesselt den juengsten Depotstand nach Gattung, Waehrung, Rhythmus,
 * Branche und Region (mit Laendern) auf.
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
  const total = entries.reduce(
    (sum, entry) => (entry.amount ? sum.add(entry.amount) : sum),
    Money.zero(currency),
  );
  if (total.isZero()) return { kind: "empty" };

  const facetOf = (row: SecuritySnapshot) => facets.get(row.security_id);
  const regionOf = (row: SecuritySnapshot): string => {
    const country = normalizedCountry(facetOf(row)?.country);
    if (country === UNKNOWN_KEY) return UNKNOWN_KEY;
    return REGION_OF_COUNTRY.get(country)?.key ?? REST_OF_WORLD.key;
  };

  const regions = group(entries, total, regionOf, (key) => REGION_LABELS.get(key) ?? key);
  for (const region of regions) {
    if (region.key === UNKNOWN_KEY) continue;
    region.children = group(
      entries.filter((entry) => regionOf(entry.row) === region.key),
      total,
      (row) => normalizedCountry(facetOf(row)?.country),
      countryLabel,
    );
  }

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
      ),
      currencies: group(
        entries,
        total,
        (row) => facetOf(row)?.currency?.trim().toUpperCase() ?? UNKNOWN_KEY,
        (key) => key,
      ),
      frequencies: group(
        entries,
        total,
        (row) => row.dividend_frequency ?? UNKNOWN_KEY,
        (key) => capitalized(FREQUENCY_LABELS[key as DividendFrequency]),
      ),
      sectors: group(
        entries,
        total,
        (row) => facetOf(row)?.sector?.trim() ?? UNKNOWN_KEY,
        (key) => key,
      ),
      regions,
    },
  };
}
