import type { Money } from "@/lib/money";
import type { PaymentSource, PaymentType } from "@/lib/supabase/database.types";

export type { PaymentSource, PaymentType };

/**
 * Normalisierter, decimal-sicherer Zahlungsdatensatz fuer die Analytics-Schicht.
 *
 * Geldbetraege liegen ausschliesslich als {@link Money} vor: die Rohstrings aus
 * Postgres (`numeric` als String) werden an der Datengrenze **einmal** in Money
 * geparst (CALCULATION_RULES.md §1). Ab hier findet keine Float-Arithmetik und
 * keine erneute Rundung statt.
 */
export interface AnalyticsPayment {
  id: string;
  /**
   * Effektives Kalenderdatum "YYYY-MM-DD" — Datumsdimension **aller** Kennzahlen.
   * Standardmaessig identisch mit {@link actualPayDate}; ist fuer das Unternehmen
   * ein Ausschuettungsplan hinterlegt, ist dies das dem naechstliegenden geplanten
   * Monat zugeordnete Datum (CALCULATION_RULES.md §10).
   */
  payDate: string;
  /** Tatsaechliches Zahlungsdatum aus der Datenbank (unveraendert, fuer Anzeige). */
  actualPayDate: string;
  netAmount: Money;
  grossAmount: Money;
  securityId: string;
  depotId: string;
  paymentType: PaymentType;
  source: PaymentSource;
  /** ISO-Timestamp; sekundaeres, stabiles Sortierkriterium (§6.12). */
  createdAt: string;
}

/** Aggregat aus Nettosumme und Zahlungsanzahl ueber eine Menge von Eingaengen. */
export interface Aggregate {
  net: Money;
  count: number;
}

/** Monatseimer eines Kalenderjahres (month 1-basiert). */
export interface MonthBucket {
  month: number;
  net: Money;
  count: number;
}

/** Jahreseimer (fuer die „Alle Jahre"-Ansicht). */
export interface YearBucket {
  year: number;
  net: Money;
  count: number;
}

/** Aggregat je Wertpapier bzw. Depot. */
export interface GroupBucket {
  key: string;
  net: Money;
  count: number;
}

/** Ein einzelner Kalendermonat mit Betrag (bester Monat, §5.5/§6.11). */
export interface MonthValue {
  year: number;
  month: number;
  net: Money;
}

/** Eckdaten der gesamten Historie (§5.3/§12), unabhaengig von der Jahresauswahl. */
export interface HistoricalSummary {
  net: Money;
  count: number;
  distinctSecurities: number;
  distinctDepots: number;
  firstPayDate: string | null;
  lastPayDate: string | null;
}

/**
 * Ergebnis eines Vorjahres-/Zeitraumvergleichs (§6.4). Diskriminierte Union,
 * damit die UI die fachlich korrekte Beschriftung waehlt und niemals eine
 * unendliche oder irrefuehrende Prozentzahl anzeigt.
 */
export type ComparisonResult =
  | {
      /** Vergleichswert > 0: prozentuale Veraenderung ist definiert. */
      kind: "percent";
      absolute: Money;
      /** Prozentpunkte (z. B. 12.3 fuer „+12,3 %"), noch ungerundet. */
      percent: import("@/lib/money").DecimalInstance;
    }
  | {
      /** Vergleichswert 0, aktueller Wert > 0 → „Neu gegenüber Vorjahr". */
      kind: "new";
      absolute: Money;
    }
  | {
      /** Beide Werte 0 → „Keine Zahlungen in beiden Zeiträumen". */
      kind: "both-zero";
    }
  | {
      /** Kein Vergleichszeitraum vorhanden bzw. nicht berechenbar. */
      kind: "no-comparison";
    };

// --- Phase 5B: Statistikbereich ---------------------------------------------

/**
 * Kombinierbarer, URL-serialisierbarer Statistikfilter (Phase 5B,
 * CALCULATION_RULES.md §11). `null` bedeutet jeweils „keine Einschraenkung".
 * Die Filterung ist eine reine Vorstufe der Aggregation und findet ausschliesslich
 * in der Analytics-Schicht statt ({@link filterPayments}) — nie in Komponenten.
 */
export interface StatisticsFilter {
  /** Kalenderjahr des effektiven Zahlungsdatums (§10) oder null. */
  year: number | null;
  securityId: string | null;
  depotId: string | null;
  source: PaymentSource | null;
  paymentType: PaymentType | null;
}

/** Gesamtueberblick der (gefilterten) Historie fuer den Statistikbereich (§11.1). */
export interface OverviewStatistics {
  net: Money;
  count: number;
  distinctSecurities: number;
  distinctDepots: number;
  /** Durchschnittliche Einzelzahlung: Nettosumme ÷ Anzahl Zahlungen (§11.2). */
  averagePayment: Money;
  /** Durchschnitt je Monat mit mindestens einer Zahlung: Nettosumme ÷ aktive Monate (§11.2). */
  averageMonth: Money;
  /** Anzahl der Kalendermonate (Jahr+Monat) mit mindestens einer Zahlung. */
  activeMonths: number;
  bestMonth: MonthValue | null;
  bestYear: YearBucket | null;
  firstPayDate: string | null;
  lastPayDate: string | null;
}

/** Kennzahlen je Kalenderjahr (§11.3), inkl. Vorjahresvergleich. */
export interface YearStatistics {
  year: number;
  net: Money;
  count: number;
  distinctSecurities: number;
  distinctDepots: number;
  averagePayment: Money;
  bestMonth: MonthValue | null;
  /** Schwaechster Monat mit Zahlungen im Jahr; null, wenn keine Zahlungen. */
  worstMonth: MonthValue | null;
  /** Veraenderung der Jahressumme gegenueber dem vorhergehenden Kalenderjahr (§6.4). */
  change: ComparisonResult;
  /** Nettosumme des Vorjahres in der Datenbasis; null, wenn kein Vorjahr vorhanden. */
  priorYearNet: Money | null;
}

/** Kennzahlen je Kalendermonat ueber alle Jahre hinweg (§11.4). */
export interface MonthAcrossYearsStatistics {
  /** Monat 1..12. */
  month: number;
  net: Money;
  count: number;
  averagePayment: Money;
  /** Entwicklung ueber die Jahre: ein Eimer je Jahr mit Zahlungen in diesem Monat, aufsteigend. */
  perYear: YearBucket[];
}

/** Kennzahlen je Unternehmen (§11.5). Archivierte Unternehmen bleiben enthalten. */
export interface SecurityStatistics {
  securityId: string;
  net: Money;
  count: number;
  firstPayDate: string | null;
  lastPayDate: string | null;
  averagePayment: Money;
  /** Groesste Einzelzahlung; null, wenn keine Zahlungen. */
  largestPayment: Money | null;
  /** Summe je Jahr, aufsteigend (Entwicklung ueber die Jahre). */
  perYear: YearBucket[];
}

/** Kennzahlen je Depot (§11.6). Archivierte Depots bleiben historisch enthalten. */
export interface DepotStatistics {
  depotId: string;
  net: Money;
  count: number;
  distinctSecurities: number;
  /** Entwicklung je Jahr, aufsteigend. */
  perYear: YearBucket[];
  /** Entwicklung je Kalendermonat (1..12) ueber alle Jahre. */
  perMonth: MonthBucket[];
}

/** Eine Jahreszeile der Zahlungs-Heatmap (§11.7): zwoelf Monatseimer eines Jahres. */
export interface HeatmapRow {
  year: number;
  months: MonthBucket[];
}

/** Sortierkriterien der Unternehmensstatistik (§11.5). */
export type SecuritySortKey = "net" | "count" | "name" | "lastPayment";
