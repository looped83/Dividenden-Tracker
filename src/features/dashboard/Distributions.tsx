import * as React from "react";
import { Section, SectionLink } from "@/components/ui/section";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import type { Money } from "@/lib/money";
import {
  aggregate,
  groupByDepot,
  groupBySecurity,
  rankGroups,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import { paymentsListHref, type EntityInfo } from "./format";
import { RankedBars, type RankedBarItem } from "./RankedBars";

/** Höchstens so viele Zeilen je Sicht. */
const MAX_ROWS = 5;
/** Mindestens so viele Assets, auch bei nur zwei Depots. */
const MIN_ROWS = 3;

type View = "assets" | "depots";

const VIEW_OPTIONS: readonly SegmentOption<View>[] = [
  { value: "assets", label: "Assets" },
  { value: "depots", label: "Depots" },
];

interface DistributionProps {
  /** Bereits auf den ausgewaehlten Zeitraum gefilterte Zahlungen. */
  periodPayments: AnalyticsPayment[];
  selection: YearSelection;
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
}

function labelOf(map: Map<string, EntityInfo>, key: string): string {
  return map.get(key)?.name ?? "Unbekannt";
}

function toItems(
  ranked: { key: string; net: Money }[],
  map: Map<string, EntityInfo>,
  hrefOf: (key: string) => string,
): RankedBarItem[] {
  return ranked.map((bucket) => {
    const info = map.get(bucket.key);
    return {
      key: bucket.key,
      name: info?.name ?? "Unbekannt",
      archived: info?.archived ?? false,
      net: bucket.net,
      href: hrefOf(bucket.key),
    };
  });
}

/**
 * „Verteilung" (§9/§10): wer im Zeitraum wie viel beigetragen hat — die
 * stärksten Assets oder die Depots, umschaltbar.
 *
 * Zuvor zwei Karten nebeneinander, Top-Assets und Depotverteilung. Beide
 * beantworten dieselbe Frage; ein Umschalter spart eine Überschrift und auf dem
 * Telefon eine ganze Bildschirmhöhe. Mit nur einem Depot wäre die zweite Sicht
 * leer an Aussage (100 %): Dann entfällt der Umschalter, der Abschnitt heißt
 * „Top-Assets".
 *
 * Mit Umschalter zeigen beide Sichten gleich viele Zeilen — so viele, wie es
 * Depots gibt (3 bis 5) — und enden beide mit einem Link in die Statistik.
 * Vorher standen fünf Assets plus Link gegen drei Depots: Der Abschnitt
 * schrumpfte beim Umschalten um zwei Zeilen und alles darunter sprang (seit
 * 1.21.2). Platz freihalten hätte Weißraum unter den Depots bedeutet.
 */
export function Distribution({
  periodPayments,
  selection,
  securities,
  depots,
}: DistributionProps) {
  const [view, setView] = React.useState<View>("assets");

  const { total, assets, assetCount, depotItems, depotCount } = React.useMemo(() => {
    const rankedAssets = rankGroups(groupBySecurity(periodPayments), (key) =>
      labelOf(securities, key),
    );
    const rankedDepots = rankGroups(groupByDepot(periodPayments), (key) =>
      labelOf(depots, key),
    );
    const rows =
      rankedDepots.length > 1
        ? Math.min(MAX_ROWS, Math.max(MIN_ROWS, rankedDepots.length))
        : MAX_ROWS;
    return {
      total: aggregate(periodPayments).net,
      assetCount: rankedAssets.length,
      depotCount: rankedDepots.length,
      assets: toItems(rankedAssets.slice(0, rows), securities, (key) =>
        paymentsListHref({ year: selection, securityId: key }),
      ),
      depotItems: toItems(rankedDepots.slice(0, rows), depots, (key) =>
        paymentsListHref({ year: selection, depotId: key }),
      ),
    };
  }, [periodPayments, selection, securities, depots]);

  const withDepots = depotCount > 1;
  const shown = withDepots ? view : "assets";
  const statisticsHref = (path: string) =>
    selection === "all" ? path : `${path}?year=${String(selection)}`;

  return (
    <Section
      title={withDepots ? "Verteilung" : "Top-Assets"}
      action={
        withDepots ? (
          <SegmentedControl
            variant="pill"
            label="Verteilung nach"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        ) : undefined
      }
    >
      {assets.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Keine Assets im ausgewählten Zeitraum.
        </p>
      ) : shown === "assets" ? (
        <>
          <RankedBars
            items={assets}
            total={total}
            ariaLabel="Top-Assets nach Nettodividende"
          />
          {(withDepots || assetCount > assets.length) && (
            <SectionLink to={statisticsHref("/statistiken/unternehmen")}>
              Alle {assetCount} Assets
            </SectionLink>
          )}
        </>
      ) : (
        <>
          <RankedBars
            items={depotItems}
            total={total}
            ariaLabel="Nettodividende je Depot"
          />
          <SectionLink to={statisticsHref("/statistiken/depots")}>
            Alle {depotCount} Depots
          </SectionLink>
        </>
      )}
    </Section>
  );
}
