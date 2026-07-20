import * as React from "react";
import { Link } from "react-router";
import { LayoutDashboard, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSecurities } from "@/features/securities/hooks";
import { useDepots } from "@/features/depots/hooks";
import {
  availableYears,
  refDateFromDate,
  yearOf,
  type AnalyticsPayment,
} from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDashboardPayments, useDashboardYear } from "./hooks";
import { YearSelector } from "./YearSelector";
import { KpiCards } from "./KpiCards";
import { MonthlyChart } from "./MonthlyChart";
import { TopCompanies, DepotDistribution } from "./Distributions";
import { RecentPayments } from "./RecentPayments";
import { HistoricalOverview } from "./HistoricalOverview";
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-3 w-40 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="h-72 w-full animate-pulse rounded bg-muted" />
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

  const payments: AnalyticsPayment[] = paymentsQuery.data ?? [];

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

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>
      <Button asChild variant="outline" size="sm">
        <Link to="/eingaenge/neu">
          <Plus /> Neuer Eingang
        </Link>
      </Button>
    </div>
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
                <Link to="/importe">
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

      <YearSelector
        selection={selection}
        onSelect={setSelection}
        availableYears={years}
      />

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

      <MonthlyChart payments={payments} selection={selection} today={today} />

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
