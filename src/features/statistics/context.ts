import { useOutletContext } from "react-router";
import type { PortfolioSeries } from "@/features/securities/snapshots";
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
   * Die Depotstaende als Zeitreihe (docs/PORTFOLIO_IMPORT.md); leer, solange
   * keiner importiert ist.
   *
   * Bewusst ein **Domaenentyp** statt Snapshot-Zeilen: Der Kontext bleibt damit
   * frei von Datenbanktypen, und die Unterbereiche bekommen Betraege in
   * derselben Gestalt wie alle anderen — als `Money`.
   *
   * Diese Werte sind Marktdaten und **Erwartungen einer fremden Quelle**. Sie
   * stehen neben den erhaltenen Summen, gehen aber in keine Kennzahl der
   * Statistik ein (PRODUCT_SPEC.md Grundsatz 8).
   */
  portfolio: PortfolioSeries;
}

export function useStatisticsContext(): StatisticsContext {
  return useOutletContext<StatisticsContext>();
}
