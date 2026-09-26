import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  fetchDashboardPayments,
  type DashboardPaymentRow,
} from "@/lib/supabase/repositories/payments";
import {
  mapAnalyticsPayment,
  payoutMonthsBySecurity,
  withEffectiveDates,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import { useSecurities } from "@/features/securities/hooks";
import { parseYearSelection, serializeYearSelection } from "./yearParam";

/**
 * Schluessel unter dem `payments`-Namespace: dadurch invalidieren alle
 * bestehenden Zahlungs-Mutationen (Anlegen, Bearbeiten, Storno, Reaktivierung)
 * sowie Import-Commit/-Rollback ueber `invalidateQueries(["payments"])` auch die
 * Dashboard-Daten (ARCHITECTURE.md, Cache-Invalidierung 5A).
 */
const DASHBOARD_PAYMENTS_KEY = ["payments", "dashboard"] as const;

/**
 * Ausserhalb der Komponente, damit die Referenz stabil bleibt: React Query
 * fuehrt `select` erneut aus, sobald sich die Funktion aendert — eine
 * Inline-Funktion ist bei jedem Rendern eine neue. Dann wurde bei jedem
 * Rendern die gesamte Historie erneut in `Money` geparst, und weil
 * `Money`-Instanzen keine einfachen Objekte sind, konnte auch das
 * strukturelle Teilen die alte Liste nicht wiederverwenden: Jede
 * nachgelagerte Auswertung (Kennzahlen, Diagramme, Statistik) rechnete neu.
 */
function toAnalyticsPayments(rows: DashboardPaymentRow[]): AnalyticsPayment[] {
  return rows.map(mapAnalyticsPayment);
}

/**
 * Laedt die aktive Dividendenhistorie **einmal** und liefert sie als bereits
 * geparste, decimal-sichere Analytics-Datensaetze. Die Jahresauswahl wird
 * ausschliesslich clientseitig angewandt, sodass ein Jahreswechsel keine neue
 * Abfrage ausloest (schnelle Jahresumschaltung, §18).
 */
export function useDashboardPayments() {
  return useQuery({
    queryKey: DASHBOARD_PAYMENTS_KEY,
    queryFn: fetchDashboardPayments,
    select: toAnalyticsPayments,
  });
}

/**
 * Die aktive Historie mit effektivem Datum je Ausschuettungsplan (§10) — die
 * gemeinsame Datenbasis von Uebersicht, Statistik und Zielen. Eine Stelle
 * statt mehrerer gleichlautender Kopien: Wendete eine davon den Plan anders
 * an, zeigten Uebersicht und Ziel fuer denselben Monat verschiedene Summen.
 *
 * Die beiden Abfragen werden mitgeliefert, weil die Aufrufer deren Lade- und
 * Fehlerzustand bzw. die Stammdaten der Unternehmen selbst brauchen.
 */
export function useEffectivePayments() {
  const paymentsQuery = useDashboardPayments();
  const securitiesQuery = useSecurities();

  const payoutBySecurity = React.useMemo(
    () => payoutMonthsBySecurity(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const payments = React.useMemo(
    () => withEffectiveDates(paymentsQuery.data ?? [], payoutBySecurity),
    [paymentsQuery.data, payoutBySecurity],
  );

  return { payments, paymentsQuery, securitiesQuery };
}

/**
 * Jahresauswahl als URL-Zustand (§3): steuerbar ueber `?year=`, bleibt nach
 * Reload erhalten und funktioniert mit Browser-Zurueck/-Vorwaerts (Push-Historie).
 */
export function useDashboardYear(): {
  selection: YearSelection;
  setSelection: (next: YearSelection) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = parseYearSelection(searchParams.get("year"));

  const setSelection = React.useCallback(
    (next: YearSelection) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("year", serializeYearSelection(next));
          return params;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  return { selection, setSelection };
}
