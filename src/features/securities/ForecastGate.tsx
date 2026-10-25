import * as React from "react";
import { TrendingUp } from "lucide-react";
import { KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizePayoutMonths } from "@/lib/statistics/effectiveMonth";
import { useToday } from "@/lib/hooks/useToday";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import { PortfolioImportButton, PortfolioImportDialog } from "./PortfolioImportDialog";
import {
  forecastTwelveMonths,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "./forecast";
import { useSecurities, useSecuritySnapshots } from "./hooks";
import { depotAssumptions, type DepotAssumptions } from "./snowball";

export interface ForecastBasis {
  forecast: TwelveMonthForecast;
  depot: DepotAssumptions;
  snapshots: readonly SecuritySnapshot[];
  names: ReadonlyMap<string, string>;
  /** Stammdaten je Asset (Land, Branche) fuer die Streuung im Planer. */
  facets: ReadonlyMap<string, ForecastFacets>;
  startYear: number;
}

/**
 * Gemeinsamer Unterbau von Bestand › Prognose und dem Planer: dieselbe
 * Prognose (CALCULATION_RULES.md §14.1) aus denselben Abfragen und demselben
 * Cache, dazu Lade-, Leer- und Waehrungszustand an einer Stelle. Die Kinder
 * bekommen nur eine fertige Prognose zu sehen.
 */
export function ForecastGate({
  emptyDescription,
  children,
}: {
  emptyDescription: string;
  children: (basis: ForecastBasis) => React.ReactNode;
}) {
  const today = useToday();
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSecuritySnapshots();
  const { payments, paymentsQuery } = useEffectivePayments();
  const [importOpen, setImportOpen] = React.useState(false);

  const { facets, names } = React.useMemo(() => {
    const facetMap = new Map<string, ForecastFacets>();
    const nameMap = new Map<string, string>();
    for (const security of securities) {
      facetMap.set(security.id, {
        name: security.name,
        payoutMonths: normalizePayoutMonths(security.payout_months),
        country: security.country,
        sector: security.sector,
      });
      nameMap.set(security.id, security.name);
    }
    return { facets: facetMap, names: nameMap };
  }, [securities]);

  const result = React.useMemo(
    () => forecastTwelveMonths({ snapshots, facets, payments, today }),
    [snapshots, facets, payments, today],
  );
  const depot = React.useMemo(() => depotAssumptions(snapshots), [snapshots]);

  if (securitiesLoading || snapshotsLoading || paymentsQuery.isLoading) {
    return (
      <div className="space-y-10" aria-busy="true" aria-live="polite">
        <span className="sr-only">Wird geladen …</span>
        <KpiHeroSkeleton stats={2} />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (result.kind === "empty" || depot === null) {
    return (
      <>
        <EmptyState
          icon={TrendingUp}
          title="Noch kein Depotstand importiert"
          description={emptyDescription}
          action={
            <PortfolioImportButton
              onClick={() => {
                setImportOpen(true);
              }}
            />
          }
        />
        <PortfolioImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </>
    );
  }

  if (result.kind === "mixedCurrency") {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Der Depotstand enthält Beträge in verschiedenen Währungen oder nicht in Euro. Ohne
        Umrechnung lässt sich keine Prognose bilden.
      </p>
    );
  }

  return children({
    forecast: result.forecast,
    depot,
    snapshots,
    names,
    facets,
    startYear: today.year,
  });
}
