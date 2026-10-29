import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { PieChart as PieChartIcon } from "lucide-react";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { normalizePayoutMonths } from "@/lib/statistics/effectiveMonth";
import { DepotHeaderActions } from "./DepotHeaderActions";
import { PortfolioSummary } from "./PortfolioSummary";
import { PortfolioImportButton, PortfolioImportDialog } from "./PortfolioImportDialog";
import { AllocationBars, AllocationRing } from "./AnalysisCharts";
import {
  analyzePortfolio,
  UNKNOWN_KEY,
  type AnalysisFacets,
  type AnalysisMeasure,
  type AnalysisSlice,
  type PortfolioAnalysis,
} from "./analysis";
import { useSecurities, useSecuritySnapshots } from "./hooks";

const MEASURE_OPTIONS: readonly SegmentOption<AnalysisMeasure>[] = [
  { value: "wert", label: "Marktwert" },
  { value: "dividende", label: "Dividende" },
];

/**
 * Unterbereich **Analyse** des Bestands: woraus das Depot besteht.
 *
 * Grundlage ist allein der juengste importierte Depotstand (dieselben Daten
 * und derselbe Query-Cache wie „Assets") samt Stammdaten — keine weitere
 * Abfrage. Der Umschalter im Seitenkopf waehlt die Bezugsgroesse fuer **alle**
 * Abschnitte zugleich und steht in der Adresse (`?nach=dividende`), damit
 * Zurueck und Direktlinks ihn behalten.
 *
 * **Ring oder Balken folgt einer Regel:** wenige feste Kategorien (Asset-Typ,
 * Waehrung, Rhythmus) als Ring, viele offene (Branche, Land) als Rangbalken.
 *
 * Eine Aufteilung nach Depot gibt es hier nicht: Der Portfolio-Export fasst
 * alle Depots zusammen (docs/PORTFOLIO_IMPORT.md §3).
 */
export function AnalysisTab() {
  const { data: securities = [], isLoading } = useSecurities();
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSecuritySnapshots();
  const [searchParams, setSearchParams] = useSearchParams();
  const measure: AnalysisMeasure =
    searchParams.get("nach") === "dividende" ? "dividende" : "wert";
  const [importOpen, setImportOpen] = React.useState(false);
  const openImport = React.useCallback(() => {
    setImportOpen(true);
  }, []);

  const facets = React.useMemo(() => {
    const map = new Map<string, AnalysisFacets>();
    for (const security of securities) {
      map.set(security.id, {
        name: security.name,
        sector: security.sector,
        country: security.country,
        currency: security.currency,
        payoutMonths: normalizePayoutMonths(security.payout_months),
      });
    }
    return map;
  }, [securities]);

  const result = React.useMemo(
    () => analyzePortfolio(snapshots, facets, measure),
    [snapshots, facets, measure],
  );

  const importDialog = (
    <PortfolioImportDialog open={importOpen} onOpenChange={setImportOpen} />
  );

  if (isLoading || snapshotsLoading) {
    return (
      <div className="space-y-10" aria-busy="true" aria-live="polite">
        <span className="sr-only">Analyse wird geladen …</span>
        <KpiHeroSkeleton stats={2} />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (result.kind === "empty") {
    return (
      <>
        <EmptyState
          icon={PieChartIcon}
          title="Noch kein Depotstand importiert"
          description="Die Analyse schlüsselt deinen Bestand nach Asset-Typ, Währung, Ausschüttungsrhythmus, Branche und Land auf. Dafür braucht sie einen Depotstand aus dem DivvyDiary-Portfolio-Export."
          action={<PortfolioImportButton onClick={openImport} />}
        />
        {importDialog}
      </>
    );
  }

  const isDividend = measure === "dividende";

  return (
    <div className="space-y-10">
      <DepotHeaderActions>
        <SegmentedControl<AnalysisMeasure>
          label="Anteile nach"
          variant="pill"
          options={MEASURE_OPTIONS}
          value={measure}
          onChange={(next) => {
            setSearchParams(
              (prev) => {
                const params = new URLSearchParams(prev);
                if (next === "dividende") params.set("nach", next);
                else params.delete("nach");
                return params;
              },
              { replace: true },
            );
          }}
        />
      </DepotHeaderActions>

      <PortfolioSummary snapshots={snapshots} onImport={openImport} />

      {result.kind === "mixedCurrency" ? (
        <p className="px-1 text-sm text-muted-foreground">
          Der Depotstand enthält Beträge in verschiedenen Währungen. Ohne Umrechnung
          lassen sich keine Anteile bilden.
        </p>
      ) : (
        <AnalysisSections
          analysis={result.analysis}
          basis={isDividend ? "der erwarteten Jahresdividende" : "am Depotwert"}
        />
      )}

      {importDialog}
    </div>
  );
}

function AnalysisSections({
  analysis,
  basis,
}: {
  analysis: PortfolioAnalysis;
  basis: string;
}) {
  return (
    <div className="space-y-10">
      {analysis.withoutAmount > 0 && (
        <p className="px-1 text-[0.8125rem] text-muted-foreground">
          {formatCountNoun(analysis.withoutAmount, "Position", "Positionen")} ohne Betrag{" "}
          {analysis.withoutAmount === 1 ? "zählt" : "zählen"} nicht mit.
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
        <Section title="Asset-Typ">
          <AllocationRing
            slices={analysis.assetTypes}
            ariaLabel={`Anteile nach Asset-Typ ${basis}`}
          />
        </Section>
        <Section title="Währung">
          <AllocationRing
            slices={analysis.currencies}
            ariaLabel={`Anteile nach Ausschüttungswährung ${basis}`}
          />
        </Section>
        <Section title="Rhythmus">
          <AllocationRing
            slices={analysis.frequencies}
            ariaLabel={`Anteile nach Ausschüttungsrhythmus ${basis}`}
          />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-10 xl:grid-cols-2">
        <Section title="Branche">
          <AllocationBars
            slices={analysis.sectors}
            param="branche"
            ariaLabel={`Anteile nach Branche ${basis}`}
          />
          <MissingFacetHint slices={analysis.sectors} noun="Branche" />
        </Section>
        <Section title="Land">
          <AllocationBars
            slices={analysis.countries}
            param="land"
            ariaLabel={`Anteile nach Land ${basis}`}
          />
          <MissingFacetHint slices={analysis.countries} noun="Land" />
        </Section>
      </div>
    </div>
  );
}

/** Weg zu den Stammdaten, wenn Positionen ohne Angabe in der Aufteilung stehen. */
function MissingFacetHint({
  slices,
  noun,
}: {
  slices: readonly AnalysisSlice[];
  noun: string;
}) {
  const unknown = slices.find((slice) => slice.key === UNKNOWN_KEY);
  if (!unknown || unknown.positions === slices.reduce((n, s) => n + s.positions, 0))
    return null;
  return (
    <p className="mt-1 text-[0.8125rem] text-muted-foreground">
      {formatCountNoun(unknown.positions, "Position", "Positionen")} ohne {noun} ·{" "}
      <Link
        to="/depot"
        className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        in den Assets ergänzen
      </Link>
    </p>
  );
}
