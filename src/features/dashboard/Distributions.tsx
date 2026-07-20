import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** §9 Top-Unternehmen: die fuenf staerksten Zahler im Zeitraum. */
export function TopCompanies({
  periodPayments,
  selection,
  securities,
}: DistributionProps) {
  const total: Money = aggregate(periodPayments).net;
  const ranked = rankGroups(groupBySecurity(periodPayments), (key) =>
    labelOf(securities, key),
  ).slice(0, TOP_COMPANIES);

  const items: RankedBarItem[] = ranked.map((bucket) => {
    const info = securities.get(bucket.key);
    return {
      key: bucket.key,
      name: info?.name ?? "Unbekannt",
      archived: info?.archived ?? false,
      net: bucket.net,
      count: bucket.count,
      href: paymentsListHref({ year: selection, securityId: bucket.key }),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Top-Unternehmen</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Keine Unternehmen im ausgewählten Zeitraum.
          </p>
        ) : (
          <RankedBars
            items={items}
            total={total}
            ariaLabel="Top-Unternehmen nach Nettodividende"
          />
        )}
      </CardContent>
    </Card>
  );
}

/** §10 Depotverteilung: Nettodividende je Depot im Zeitraum. */
export function DepotDistribution({
  periodPayments,
  selection,
  depots,
}: DistributionProps) {
  const total: Money = aggregate(periodPayments).net;
  const ranked = rankGroups(groupByDepot(periodPayments), (key) => labelOf(depots, key));

  const items: RankedBarItem[] = ranked.map((bucket) => {
    const info = depots.get(bucket.key);
    return {
      key: bucket.key,
      name: info?.name ?? "Unbekannt",
      archived: info?.archived ?? false,
      net: bucket.net,
      count: bucket.count,
      href: paymentsListHref({ year: selection, depotId: bucket.key }),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Depotverteilung</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Keine Depots im ausgewählten Zeitraum.
          </p>
        ) : (
          <RankedBars items={items} total={total} ariaLabel="Nettodividende je Depot" />
        )}
      </CardContent>
    </Card>
  );
}
