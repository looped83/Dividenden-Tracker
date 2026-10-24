import * as React from "react";
import { Section, SectionLink } from "@/components/ui/section";
import {
  aggregate,
  groupBySecurity,
  rankGroups,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import { paymentsListHref, type EntityInfo } from "./format";
import { RankedBars } from "./RankedBars";

const TOP_COMPANIES = 5;

interface DistributionProps {
  /** Bereits auf den ausgewaehlten Zeitraum gefilterte Zahlungen. */
  periodPayments: AnalyticsPayment[];
  selection: YearSelection;
  securities: Map<string, EntityInfo>;
}

/**
 * „Verteilung" (§9/§10): welche fünf Assets im Zeitraum am meisten beigetragen
 * haben. „Alle" im Kopf führt zur ganzen Liste unter Statistiken — dieselbe
 * Form wie bei „Letzte Dividenden".
 *
 * Bis 2.10 gab es hier einen Umschalter Assets | Depots. Die Depotsicht steht
 * unter Statistiken › Aufteilung; auf der Übersicht zählt der Blick
 * auf die stärksten Assets.
 */
export function Distribution({
  periodPayments,
  selection,
  securities,
}: DistributionProps) {
  const { total, assets } = React.useMemo(() => {
    const ranked = rankGroups(
      groupBySecurity(periodPayments),
      (key) => securities.get(key)?.name ?? "Unbekannt",
    );
    return {
      total: aggregate(periodPayments).net,
      assets: ranked.slice(0, TOP_COMPANIES).map((bucket) => {
        const info = securities.get(bucket.key);
        return {
          key: bucket.key,
          name: info?.name ?? "Unbekannt",
          archived: info?.archived ?? false,
          net: bucket.net,
          href: paymentsListHref({ year: selection, securityId: bucket.key }),
        };
      }),
    };
  }, [periodPayments, selection, securities]);

  const allHref =
    selection === "all"
      ? "/statistiken/unternehmen"
      : `/statistiken/unternehmen?year=${String(selection)}`;

  return (
    <Section
      title="Verteilung"
      action={
        assets.length > 0 ? <SectionLink to={allHref}>Alle</SectionLink> : undefined
      }
    >
      {assets.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Keine Assets im ausgewählten Zeitraum.
        </p>
      ) : (
        <RankedBars
          items={assets}
          total={total}
          ariaLabel="Top-Assets nach Nettodividende"
        />
      )}
    </Section>
  );
}
