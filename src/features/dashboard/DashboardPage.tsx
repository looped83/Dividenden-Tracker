import * as React from "react";
import { Link } from "react-router";
import { LayoutDashboard, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
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
import { TopCompanies, DepotDistribution } from "./Distributions";
import { RecentPayments } from "./RecentPayments";
import { HistoricalOverview } from "./HistoricalOverview";
import { buildEntityMap, describeSelection } from "./format";

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Dashboard wird geladen …</span>
      <DashboardHeroSkeleton />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const today = useToday();
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
              <Button asChild>
                <Link to="/eingaenge/neu">
                  <Plus /> Ersten Eingang erfassen
                </Link>
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

      <DashboardHero payments={payments} selection={selection} today={today} />

      {/* Was demnächst kommt, gehört zum Jetzt: im laufenden Jahr und bei
          „Alle Jahre", nicht beim Blick zurück auf 2024. */}
      {(selection === "all" || selection === today.year) && (
        <UpcomingPayments today={isoFromRef(today)} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopCompanies
          periodPayments={periodPayments}
          selection={selection}
          securities={securities}
          depots={depots}
        />
        <DepotDistribution
          periodPayments={periodPayments}
          selection={selection}
          securities={securities}
          depots={depots}
        />
      </div>

      <RecentPayments payments={payments} securities={securities} depots={depots} />

      <HistoricalOverview payments={payments} selection={selection} />
    </div>
  );
}
