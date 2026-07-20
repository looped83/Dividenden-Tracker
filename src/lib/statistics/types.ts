import type { Money } from "@/lib/money";
import type { PaymentSource, PaymentType } from "@/lib/supabase/database.types";

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
  /** Kalenderdatum "YYYY-MM-DD" (Datumsdimension aller Kennzahlen). */
  payDate: string;
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
