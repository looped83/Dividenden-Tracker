import * as React from "react";
import { Link } from "react-router";
import { LayoutDashboard, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useSecurities } from "@/features/securities/hooks";
import { useDepots } from "@/features/depots/hooks";
import {
  availableYears,
  normalizePayoutMonths,
  refDateFromDate,
  withEffectiveDates,
  yearOf,
} from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDashboardPayments, useDashboardYear } from "./hooks";
import { YearSelector } from "./YearSelector";
import { KpiCards } from "./KpiCards";
// Recharts wiegt gepackt rund 108 kB und wird nur fuer die Diagramme
// gebraucht; nachgeladen faellt es aus dem Startpaket heraus.
const MonthlyChart = React.lazy(async () => ({
  default: (await import("./MonthlyChart")).MonthlyChart,
}));
import { TopCompanies, DepotDistribution } from "./Distributions";
import { RecentPayments } from "./RecentPayments";
import { HistoricalOverview } from "./HistoricalOverview";
import { GoalSection } from "./GoalSection";
import { describeSelection, type EntityInfo } from "./format";

interface EntityRow {
  id: string;
  name: string;
  archived_at: string | null;
}

function buildEntityMap(rows: EntityRow[]): Map<string, EntityInfo> {
  return new Map(
    rows.map((row) => [row.id, { name: row.name, archived: row.archived_at !== null }]),
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Dashboard wird geladen …</span>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2 sm:pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="mt-3 h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const today = React.useMemo(() => refDateFromDate(), []);
  const { selection, setSelection } = useDashboardYear();
  const paymentsQuery = useDashboardPayments();
  const securitiesQuery = useSecurities();
  const depotsQuery = useDepots();

  const securities = React.useMemo(
    () => buildEntityMap(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const depots = React.useMemo(
    () => buildEntityMap(depotsQuery.data ?? []),
    [depotsQuery.data],
  );

  // Ausschuettungsplan je Unternehmen → effektiver Monat je Zahlung (§10).
  // Alle Auswertungen laufen auf `payments` mit effektivem Datum.
  const payoutBySecurity = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const security of securitiesQuery.data ?? []) {
      const months = normalizePayoutMonths(security.payout_months);
      if (months.length > 0) map.set(security.id, months);
    }
    return map;
  }, [securitiesQuery.data]);
  const payments = React.useMemo(
    () => withEffectiveDates(paymentsQuery.data ?? [], payoutBySecurity),
    [paymentsQuery.data, payoutBySecurity],
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

      <KpiCards payments={payments} selection={selection} today={today} />

      <GoalSection payments={payments} selection={selection} today={today} />

      <React.Suspense fallback={<Skeleton className="h-72 rounded-lg" />}>
        <MonthlyChart payments={payments} selection={selection} today={today} />
      </React.Suspense>

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

      <HistoricalOverview payments={payments} />
    </div>
  );
}
