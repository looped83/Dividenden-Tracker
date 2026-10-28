import * as React from "react";
import { Outlet, useMatch } from "react-router";
import { BarChart3 } from "lucide-react";
import { STATISTICS_TABS } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";
import { availableYears, filterPayments } from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { FilterToggle, useFilterDisclosure } from "@/components/ui/filter-bar";
import { FilterBar } from "./FilterBar";
import { activeFilterCount } from "./filterParams";
import { useStatisticsData, useStatisticsFilter, type StatisticsContext } from "./hooks";

function StatisticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Statistiken werden geladen …</span>
      {/* In der Form des Kennzahlkopfs, mit dem jeder Reiter beginnt. */}
      <KpiHeroSkeleton />
    </div>
  );
}

export function StatisticsPage() {
  const { filter, setFilter } = useStatisticsFilter();
  // Der Filter geht in die Datenbasis hinein, weil die Depotstaende ihm ebenso
  // folgen muessen wie die Zahlungen (siehe useStatisticsData).
  const data = useStatisticsData(filter);
  // Der Vergleich kommt ohne Jahresregler aus: Er waehlt seine Zeitraeume
  // selbst (§11.10), ein wirkungsloses Bedienelement ist schlimmer als keines.
  // In der Uebersicht wirkt er auf die Kennzahlen; die Matrix darunter stellt
  // grundsaetzlich alle Jahre gegenueber (§11.12) und sagt das, solange ein
  // Jahr gewaehlt ist. Unternehmen und Depotkonto wirken ueberall.
  const isComparison = useMatch("/statistiken/vergleich") !== null;
  // Aufteilung: Auf dem Telefon beginnt die Liste mit Suche und Sortierung.
  const isCompanies = useMatch("/statistiken/unternehmen") !== null;
  const isDepots = useMatch("/statistiken/depots") !== null;
  const isBreakdown = isCompanies || isDepots;
  const filterDisclosure = useFilterDisclosure(activeFilterCount(filter, !isComparison));

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
    [
      filteredPayments,
      data.payments,
      data.securities,
      data.depots,
      filter,
    ],
  );

  const heading = <PageHeader title="Statistiken" />;

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
          title="Noch keine Dividenden vorhanden"
          description="Sobald Dividenden erfasst oder importiert sind, erscheinen hier tiefergehende historische Auswertungen."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Der Filter steht auf dem Telefon rechts im Kopf — wie die
          Jahresauswahl der Uebersicht; seine Felder klappen unter den Reitern
          auf. Ab `sm` stehen sie dort dauerhaft. */}
      <PageHeader
        title="Statistiken"
        actions={<FilterToggle disclosure={filterDisclosure} />}
      />

      <TabNav label="Statistikbereiche" tabs={STATISTICS_TABS} />

      <FilterBar
        disclosure={filterDisclosure}
        filter={filter}
        setFilter={setFilter}
        years={years}
        securities={data.securities}
        depots={data.depots}
        showYear={!isComparison}
        // Folgt eine weitere Zeile Felder (Zeitraeume im Vergleich, Suche und
        // Sortierung der Aufteilung auf dem Telefon), steht sie im
        // Zeilenabstand der Leiste (0,75rem), nicht im Abschnittsabstand.
        // Eingeklappt ist die Leiste `hidden`, dann gilt wieder der Abstand
        // zu den Reitern.
        className={isComparison ? "mb-3!" : isBreakdown ? "max-md:mb-3!" : ""}
      />

      {/* Eigener Ladezustand: Beim Reiterwechsel bleiben Kopfzeile, Reiter und
          Filter stehen, nur der Inhalt darunter wartet. */}
      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet context={context} />
      </React.Suspense>
    </div>
  );
}
