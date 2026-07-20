import * as React from "react";
import { NavLink, Outlet } from "react-router";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { availableYears, filterPayments } from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import { FilterBar } from "./FilterBar";
import { useStatisticsData, useStatisticsFilter, type StatisticsContext } from "./hooks";

interface StatTab {
  to: string;
  label: string;
  end?: boolean;
}

/** Unterbereiche der Statistik (§11): Übersicht, Jahre, Monate, Unternehmen, Depots. */
const STAT_TABS: readonly StatTab[] = [
  { to: "/statistiken", label: "Übersicht", end: true },
  { to: "/statistiken/jahre", label: "Jahre" },
  { to: "/statistiken/monate", label: "Monate" },
  { to: "/statistiken/unternehmen", label: "Unternehmen" },
  { to: "/statistiken/depots", label: "Depots" },
];

function StatisticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Statistiken werden geladen …</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function StatisticsPage() {
  const data = useStatisticsData();
  const { filter, setFilter } = useStatisticsFilter();

  const years = React.useMemo(() => availableYears(data.payments), [data.payments]);
  const filteredPayments = React.useMemo(
    () => filterPayments(data.payments, filter),
    [data.payments, filter],
  );

  const context: StatisticsContext = React.useMemo(
    () => ({
      payments: filteredPayments,
      allPayments: data.payments,
      securities: data.securities,
      depots: data.depots,
      filter,
    }),
    [filteredPayments, data.payments, data.securities, data.depots, filter],
  );

  const heading = <h1 className="text-xl font-semibold tracking-tight">Statistik</h1>;

  if (data.isLoading) {
    return (
      <div className="space-y-6">
        {heading}
        <StatisticsSkeleton />
      </div>
    );
  }

  if (data.isError) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          icon={BarChart3}
          title="Statistiken konnten nicht geladen werden"
          description={getErrorMessage(
            data.error,
            "Beim Laden der Dividendendaten ist ein Fehler aufgetreten.",
          )}
          action={<Button onClick={data.refetch}>Erneut versuchen</Button>}
        />
      </div>
    );
  }

  if (data.payments.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          icon={BarChart3}
          title="Noch keine Dividendeneingänge vorhanden"
          description="Sobald Dividendeneingänge erfasst oder importiert sind, erscheinen hier tiefergehende historische Auswertungen."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}

      <nav aria-label="Statistikbereiche" className="border-b border-border">
        <ul className="-mb-px flex flex-wrap gap-1">
          {STAT_TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end ?? false}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        years={years}
        securities={data.securities}
        depots={data.depots}
      />

      <Outlet context={context} />
    </div>
  );
}
