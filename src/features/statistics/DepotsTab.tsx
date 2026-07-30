import * as React from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  aggregate,
  calendarMonthBuckets,
  depotStatistics,
  MONTH_NAMES_DE_SHORT,
  type DepotStatistics,
} from "@/lib/statistics";
import { RankedBars, type RankedBarItem } from "@/features/dashboard/RankedBars";
import { useStatisticsContext } from "./context";
import {
  entityArchived,
  entityName,
  formatCountNumber,
  statisticsDrillHref,
} from "./format";
import { CategoryBarChart } from "./components/charts";
import { StatSearch, StatTable, type StatColumn } from "./components/StatTable";

export function DepotsTab() {
  const { payments, depots, filter } = useStatisticsContext();
  const navigate = useNavigate();

  // Die Suche liegt hier statt in der Tabelle: Auf breiten Schirmen steht sie
  // in der Kopfzeile der Kachel, neben der Ueberschrift.
  const [query, setQuery] = React.useState("");

  const stats = React.useMemo(() => depotStatistics(payments), [payments]);
  const total = React.useMemo(() => aggregate(payments).net, [payments]);

  const distributionItems = React.useMemo<RankedBarItem[]>(
    () =>
      stats.map((stat) => ({
        key: stat.depotId,
        name: entityName(depots, stat.depotId),
        archived: entityArchived(depots, stat.depotId),
        net: stat.net,
        href: statisticsDrillHref(filter, { depotId: stat.depotId }),
      })),
    [stats, depots, filter],
  );

  const monthlyData = React.useMemo(
    () =>
      calendarMonthBuckets(payments).map((bucket) => ({
        key: String(bucket.month),
        label: MONTH_NAMES_DE_SHORT[bucket.month - 1] ?? String(bucket.month),
        value: bucket.net.toChartNumber(),
        money: bucket.net,
        count: bucket.count,
        href: statisticsDrillHref(filter, { month: bucket.month }),
      })),
    [payments, filter],
  );

  const columns = React.useMemo<StatColumn<DepotStatistics>[]>(
    () => [
      {
        key: "name",
        header: "Depot",
        headerLabel: "Depotname",
        compare: (a, b) =>
          entityName(depots, a.depotId).localeCompare(
            entityName(depots, b.depotId),
            "de",
          ),
        render: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">
              {entityName(depots, row.depotId)}
            </span>
            {entityArchived(depots, row.depotId) && (
              <Badge variant="neutral" className="shrink-0">
                Archiviert
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "net",
        header: "Summe",
        headerLabel: "Summe",
        align: "right",
        compare: (a, b) => a.net.compareTo(b.net),
        render: (row) => <AmountText amount={row.net} />,
      },
      {
        key: "count",
        header: "Zahlungen",
        headerLabel: "Anzahl Zahlungen",
        align: "right",
        compare: (a, b) => a.count - b.count,
        render: (row) => formatCountNumber(row.count),
      },
      {
        key: "securities",
        header: "Unternehmen",
        headerLabel: "Anzahl Unternehmen",
        align: "right",
        compare: (a, b) => a.distinctSecurities - b.distinctSecurities,
        render: (row) => formatCountNumber(row.distinctSecurities),
      },
    ],
    [depots],
  );

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Depotdaten"
        description="Für den aktuellen Filter liegen keine Dividendeneingänge vor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-5">
          <CardTitle>Depotverteilung</CardTitle>
        </CardHeader>
        <CardContent>
          <RankedBars
            items={distributionItems}
            total={total}
            ariaLabel="Netto-Dividende je Depot"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-5">
          <CardTitle>Monatliche Verteilung</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBarChart
            data={monthlyData}
            ariaLabel="Netto-Dividende je Kalendermonat"
            categoryHeader="Monat"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Depotstatistik</CardTitle>
          <div className="sm:w-64 sm:shrink-0">
            <StatSearch value={query} onChange={setQuery} placeholder="Depot suchen …" />
          </div>
        </CardHeader>
        <CardContent>
          <StatTable
            rows={stats}
            columns={columns}
            getRowKey={(row) => row.depotId}
            caption="Kennzahlen je Depot"
            searchOf={(row) => entityName(depots, row.depotId)}
            query={query}
            initialSort={{ key: "net", direction: "desc" }}
            onRowClick={(row) =>
              void navigate(statisticsDrillHref(filter, { depotId: row.depotId }))
            }
            rowLabel={(row) =>
              `Dividendeneingänge im Depot ${entityName(depots, row.depotId)} anzeigen`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
