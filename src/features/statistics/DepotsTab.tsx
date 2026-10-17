import * as React from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  aggregate,
  shareOfTotal,
  calendarMonthBuckets,
  depotStatistics,
  MONTH_NAMES_DE_SHORT,
  type DepotStatistics,
} from "@/lib/statistics";
import { formatPercent } from "@/lib/money";
import { compareGerman } from "@/lib/utils/compareText";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { RankedBars, type RankedBarItem } from "@/features/dashboard/RankedBars";
import { barLength } from "@/features/dashboard/format";
import { useStatisticsContext } from "./context";
import { BreakdownSwitch } from "./BreakdownSwitch";
import {
  entityArchived,
  entityName,
  formatCountNoun,
  formatCountNumber,
  formatPayments,
  statisticsDrillHref,
} from "./format";
import { CategoryBarChart } from "./components/charts";
import { StatTable, type StatColumn } from "./components/StatTable";

export function DepotsTab() {
  const { payments, depots, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const stats = React.useMemo(() => depotStatistics(payments), [payments]);
  const total = React.useMemo(() => aggregate(payments).net, [payments]);
  const maxNet = React.useMemo(
    () => stats.reduce((max, stat) => Math.max(max, stat.net.toChartNumber()), 0),
    [stats],
  );
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

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
          compareGerman(entityName(depots, a.depotId), entityName(depots, b.depotId)),
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
        header: "Anzahl",
        headerLabel: "Anzahl Dividenden",
        align: "right",
        compare: (a, b) => a.count - b.count,
        render: (row) => formatCountNumber(row.count),
      },
      {
        key: "securities",
        header: "Assets",
        headerLabel: "Anzahl Assets",
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
        description="Für den aktuellen Filter liegen keine Dividenden vor."
      />
    );
  }

  const distribution = (
    <Section title="Verteilung" action={<BreakdownSwitch />} actionClassName="shrink-0">
      <div>
        <RankedBars
          items={distributionItems}
          total={total}
          ariaLabel="Netto-Dividende je Depot"
          columns
        />
      </div>
    </Section>
  );

  // Ohne Suchfeld: Depots zaehlt man an einer Hand. Ein Filter fuer eine
  // Liste, die vollstaendig ins Bild passt, ist ein Bedienelement ohne
  // Aufgabe — anders als bei den Unternehmen, wo Hunderte Zeilen stehen
  // koennen.
  const depotTable = (
    <StatTable
      rows={stats}
      columns={columns}
      getRowKey={(row) => row.depotId}
      caption="Kennzahlen je Depot"
      initialSort={{ key: "net", direction: "desc" }}
      // Auf dem Telefon wie bei den Assets: die Sortierung ueber der
      // Ueberschrift, der Umschalter daneben bleibt an seiner Stelle.
      {...(!isWide && { title: "Verteilung", titleAction: <BreakdownSwitch /> })}
      onRowClick={(row) =>
        void navigate(statisticsDrillHref(filter, { depotId: row.depotId }))
      }
      rowLabel={(row) =>
        `Dividenden im Depot ${entityName(depots, row.depotId)} anzeigen`
      }
      listSummary={{
        bar: (row) => {
          const share = shareOfTotal(row.net, total);
          return {
            length: barLength(row.net, maxNet),
            label: share ? formatPercent(share) : "—",
          };
        },
        meta: (row) =>
          `${formatPayments(row.count)} · ${formatCountNoun(row.distinctSecurities, "Asset", "Assets")}`,
      }}
    />
  );

  const statistic = isWide ? (
    <Section title="Depotstatistik">
      <div>{depotTable}</div>
    </Section>
  ) : (
    depotTable
  );

  // Auf dem Telefon traegt die Liste die Verteilung selbst (Balken je Zeile)
  // und steht deshalb vorn; die Rangbalken darueber entfallen dort. Ab `md`
  // zeigt die Tabelle keine Balken — dort bleibt die Reihenfolge Verteilung,
  // Monate, Tabelle.
  return (
    <div className="space-y-10">
      {isWide ? distribution : statistic}
      <Section title="Monatliche Verteilung">
        <div>
          <CategoryBarChart
            data={monthlyData}
            ariaLabel="Netto-Dividende je Kalendermonat"
            categoryHeader="Monat"
          />
        </div>
      </Section>

      {isWide && statistic}
    </div>
  );
}
