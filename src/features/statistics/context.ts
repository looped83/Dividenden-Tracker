import { useOutletContext } from "react-router";
import type { Money } from "@/lib/money";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";

/**
 * Kontext, den die Statistik-Layoutseite an alle Unterbereiche weitergibt:
 * bereits **gefilterte** Zahlungen (einmal berechnet) plus Namensaufloesung und
 * der aktive Filter. So aggregiert jede Unterseite dieselbe Datenbasis, ohne die
 * Query erneut auszufuehren.
 *
 * Bewusst frei von Supabase-/Query-Abhaengigkeiten, damit die Unterbereiche
 * (und ihre Tests) ohne Datenzugriffsschicht gerendert werden koennen.
 */
export interface StatisticsContext {
  /** Auf den aktiven Filter reduzierte Zahlungen. */
  payments: AnalyticsPayment[];
  /** Alle aktiven Zahlungen (ungefiltert) — z. B. fuer Filteroptionen. */
  allPayments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
  filter: StatisticsFilter;
  /**
   * Erwartete Jahresdividende je Unternehmen aus dem juengsten Depotstand
   * (docs/PORTFOLIO_IMPORT.md); leer, solange keiner importiert ist.
   *
   * Bewusst als fertige Betraege statt als Snapshot-Zeilen: Der Kontext bleibt
   * damit frei von Datenbanktypen, und die Unterbereiche bekommen die Zahl in
   * derselben Gestalt wie alle anderen — als `Money`.
   *
   * Diese Werte sind **Erwartungen einer fremden Quelle**. Sie stehen neben den
   * erhaltenen Summen, gehen aber in keine Kennzahl der Statistik ein
   * (PRODUCT_SPEC.md Grundsatz 8).
   */
  expectedAnnualDividend: Map<string, Money>;
}

export function useStatisticsContext(): StatisticsContext {
  return useOutletContext<StatisticsContext>();
}
