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

/**
 * Hält den Abschnitt beim Umschalten an seiner Stelle im Fenster.
 *
 * Fünf Assets plus Link sind höher als drei Depots. Was darunter steht, darf
 * nachrücken — der Umschalter selbst aber nicht unter dem Finger wegspringen.
 * Genau das tat er am Seitenende: Schrumpft die Seite, setzt der Browser den
 * Bildlauf zurück, und alles rutscht um die Differenz nach unten. Deshalb hält
 * `capture` die Seitenhöhe kurz fest; nach dem Rendern bleibt nur so viel
 * davon, wie das Fenster gerade braucht, und der Rest schmilzt beim
 * Zurückscrollen weg. Weicht der Abschnitt trotzdem ab (Scroll-Anchoring der
 * Browser verhält sich unterschiedlich), gleicht `scrollBy` es aus.
 */
function useStableToggle(view: unknown) {
  const ref = React.useRef<HTMLElement>(null);
  const before = React.useRef<{ top: number; height: number; page: number } | null>(null);
  /** Höhe des Inhalts, solange eine Seitenhöhe festgehalten wird. */
  const held = React.useRef<number | null>(null);

  const capture = () => {
    const section = ref.current;
    if (!section) return;
    const root = document.documentElement;
    const rect = section.getBoundingClientRect();
    before.current = {
      top: rect.top,
      height: rect.height,
      page: held.current ?? root.scrollHeight,
    };
    root.style.minHeight = `${String(root.scrollHeight)}px`;
  };

  React.useLayoutEffect(() => {
    const previous = before.current;
    const section = ref.current;
    before.current = null;
    if (!previous || !section) return;
    const root = document.documentElement;
    const rect = section.getBoundingClientRect();
    // Seitenhöhe ohne Festhalten: vorher plus Änderung des Abschnitts.
    const natural = previous.page + rect.height - previous.height;
    held.current = natural;

    /** Hält nur so viel Höhe, wie das Fenster braucht; `true`, wenn nichts mehr. */
    const release = () => {
      const needed = window.scrollY + window.innerHeight;
      if (needed > natural) {
        root.style.minHeight = `${String(needed)}px`;
        return false;
      }
      root.style.minHeight = "";
      held.current = null;
      window.removeEventListener("scroll", release);
      return true;
    };
    const shift = rect.top - previous.top;
    if (shift !== 0) window.scrollBy(0, shift);
    if (release()) return;
    window.addEventListener("scroll", release, { passive: true });
    return () => {
      window.removeEventListener("scroll", release);
      // Beim nächsten Umschalten bleibt die Höhe stehen, `capture` hat sie
      // gerade erst gesetzt. Nur beim Verlassen der Seite fällt sie weg.
      if (before.current === null) {
        root.style.minHeight = "";
        held.current = null;
      }
    };
  }, [view]);

  return { ref, capture };
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
  const { ref, capture } = useStableToggle(view);
  const changeView = (next: View) => {
    capture();
    setView(next);
  };

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
      ref={ref}
      title={withDepots ? "Verteilung" : "Top-Assets"}
      action={
        withDepots ? (
          <SegmentedControl
            variant="pill"
            label="Verteilung nach"
            options={VIEW_OPTIONS}
            value={view}
            onChange={changeView}
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
          {assetCount > TOP_COMPANIES && (
            <SectionLink to={statisticsHref("/statistiken/unternehmen")}>
              Alle {assetCount} Assets
            </SectionLink>
          )}
        </>
      ) : (
        <RankedBars
          items={depotItems}
          total={total}
          ariaLabel="Nettodividende je Depot"
        />
      )}
    </Section>
  );
}
