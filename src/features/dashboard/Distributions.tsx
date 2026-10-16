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

const TOP_COMPANIES = 5;

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

/** Verborgene Sicht: belegt Platz, ist aber weder sichtbar noch erreichbar. */
function hiddenUnless(visible: boolean) {
  return visible ? {} : { className: "invisible", "aria-hidden": true, inert: true };
}

/**
 * „Verteilung" (§9/§10): wer im Zeitraum wie viel beigetragen hat — die fünf
 * stärksten Assets oder die Depots, umschaltbar.
 *
 * Zuvor zwei Karten nebeneinander, Top-Assets und Depotverteilung. Beide
 * beantworten dieselbe Frage; ein Umschalter spart eine Überschrift und auf dem
 * Telefon eine ganze Bildschirmhöhe. Mit nur einem Depot wäre die zweite Sicht
 * leer an Aussage (100 %): Dann entfällt der Umschalter, der Abschnitt heißt
 * „Top-Assets".
 */
export function Distribution({
  periodPayments,
  selection,
  securities,
  depots,
}: DistributionProps) {
  const [view, setView] = React.useState<View>("assets");

  const { total, assets, assetCount, depotItems } = React.useMemo(() => {
    const rankedAssets = rankGroups(groupBySecurity(periodPayments), (key) =>
      labelOf(securities, key),
    );
    const rankedDepots = rankGroups(groupByDepot(periodPayments), (key) =>
      labelOf(depots, key),
    );
    return {
      total: aggregate(periodPayments).net,
      assetCount: rankedAssets.length,
      assets: toItems(rankedAssets.slice(0, TOP_COMPANIES), securities, (key) =>
        paymentsListHref({ year: selection, securityId: key }),
      ),
      depotItems: toItems(rankedDepots, depots, (key) =>
        paymentsListHref({ year: selection, depotId: key }),
      ),
    };
  }, [periodPayments, selection, securities, depots]);

  const withDepots = depotItems.length > 1;
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
      ) : (
        // Beide Sichten liegen übereinander in derselben Rasterzelle, die
        // verborgene unsichtbar: Der Abschnitt ist so hoch wie die höhere.
        // Fünf Assets plus Link gegenüber drei Depots ließen ihn sonst beim
        // Umschalten schrumpfen — alles darunter sprang, und mit dem Bildlauf
        // auch der Umschalter selbst unter dem Finger weg.
        <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          <div {...hiddenUnless(shown === "assets")}>
            <RankedBars
              items={assets}
              total={total}
              ariaLabel="Top-Assets nach Nettodividende"
            />
            {assetCount > TOP_COMPANIES && (
              <SectionLink to={statisticsHref("/statistiken/unternehmen")}>
                Alle {assetCount} Assets
              </SectionLink>
            )}
          </div>
          {withDepots && (
            <div {...hiddenUnless(shown === "depots")}>
              <RankedBars
                items={depotItems}
                total={total}
                ariaLabel="Nettodividende je Depot"
              />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
