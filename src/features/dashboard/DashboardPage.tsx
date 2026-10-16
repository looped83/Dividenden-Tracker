import * as React from "react";
import { Link } from "react-router";
import { LayoutDashboard, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDepots } from "@/features/depots/hooks";
import { availableYears, isoFromRef, yearOf } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDashboardYear, useEffectivePayments } from "./hooks";
import { YearSelector } from "./YearSelector";
// Das Diagramm steht im Kopf und ist ein eigenes kleines SVG — die Uebersicht
// laedt Recharts damit gar nicht mehr.
import { DashboardHero, DashboardHeroSkeleton } from "./DashboardHero";
import { UpcomingPayments } from "./UpcomingPayments";
import { Distribution } from "./Distributions";
import { RecentPayments } from "./RecentPayments";
import { HistoricalOverview } from "./HistoricalOverview";
import { buildEntityMap, describeSelection } from "./format";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Dashboard wird geladen …</span>
      <DashboardHeroSkeleton />
      <div className="space-y-3 pt-4" aria-hidden>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const today = useToday();
  const newPayment = usePaymentComposer();
  const { selection, setSelection } = useDashboardYear();
  // Alle Auswertungen laufen auf `payments` mit effektivem Datum (§10).
  const { payments, paymentsQuery, securitiesQuery } = useEffectivePayments();
  const depotsQuery = useDepots();

  const securities = React.useMemo(
    () => buildEntityMap(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const depots = React.useMemo(
    () => buildEntityMap(depotsQuery.data ?? []),
    [depotsQuery.data],
  );

  const years = React.useMemo(() => availableYears(payments), [payments]);
  const periodPayments = React.useMemo(
    () =>
      selection === "all"
        ? payments
        : payments.filter((p) => yearOf(p.payDate) === selection),
    [payments, selection],
  );

  // Das Erfassen liegt in der Navigation (Sidebar bzw. Bottom-Nav) und damit
  // auf jeder Seite an derselben Stelle — die Kopfzeile traegt hier nur den
  // Zeitraum, der ausschliesslich diese Seite betrifft.
  const heading = (
    <PageHeader
      title="Übersicht"
      actions={
        <YearSelector
          selection={selection}
          onSelect={setSelection}
          availableYears={years}
        />
      }
    />
  );

  if (paymentsQuery.isLoading) {
    return (
      <div className="space-y-6">
        {heading}
        <DashboardSkeleton />
      </div>
    );
  }

  if (paymentsQuery.isError) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard konnte nicht geladen werden"
          description={getErrorMessage(
            paymentsQuery.error,
            "Beim Laden der Dividendendaten ist ein Fehler aufgetreten.",
          )}
          action={
            <Button onClick={() => void paymentsQuery.refetch()}>Erneut versuchen</Button>
          }
        />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          icon={LayoutDashboard}
          title="Noch keine Dividendeneingänge vorhanden"
          description="Erfasse deinen ersten Eingang oder importiere deine bisherige Historie, um Kennzahlen zu sehen."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button aria-haspopup="dialog" {...newPayment}>
                <Plus /> Ersten Eingang erfassen
              </Button>
              <Button asChild variant="outline">
                <Link to="/einstellungen/importe">
                  <Upload /> Historie importieren
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const emptyYear = typeof selection === "number" && periodPayments.length === 0;

  return (
    <div className="space-y-6">
      {heading}

      {emptyYear && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          Für {describeSelection(selection)} liegen keine Dividendeneingänge vor. Die
          zeitraumunabhängigen Kennzahlen (aktueller Monat, Historie) bleiben sichtbar.
        </p>
      )}

      {/* Telefon: eine Spalte in der Reihenfolge Kopf, Demnächst, Verteilung,
          Eingänge, Gesamt. Ab `lg` zwei Spalten — links Kopf und Eingänge,
          rechts was daneben gelesen wird. Die Spalten sind auf dem Telefon
          `contents`, damit `order` die Abschnitte über beide hinweg ordnet. */}
      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-16">
        <div className="contents lg:flex lg:flex-col lg:gap-12">
          <div className="order-1">
            <DashboardHero payments={payments} selection={selection} today={today} />
          </div>
          <div className="order-4">
            <RecentPayments payments={payments} securities={securities} depots={depots} />
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-12">
          {/* Was demnächst kommt, gehört zum Jetzt: im laufenden Jahr und bei
              „Alle Jahre", nicht beim Blick zurück auf 2024. */}
          {(selection === "all" || selection === today.year) && (
            <div className="order-2">
              <UpcomingPayments today={isoFromRef(today)} />
            </div>
          )}
          <div className="order-3">
            <Distribution
              periodPayments={periodPayments}
              selection={selection}
              securities={securities}
              depots={depots}
            />
          </div>
          <div className="order-5 empty:hidden">
            <HistoricalOverview payments={payments} selection={selection} />
          </div>
        </div>
      </div>
    </div>
  );
}
