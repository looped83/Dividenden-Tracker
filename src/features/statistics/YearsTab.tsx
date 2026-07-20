import * as React from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  monthNameDe,
  yearlyBuckets,
  yearStatistics,
  type ComparisonResult,
  type MonthValue,
  type YearStatistics,
} from "@/lib/statistics";
import { formatMoney } from "@/lib/money";
import { useStatisticsContext } from "./context";
import {
  describeComparison,
  formatCountNumber,
  statisticsDrillHref,
  statisticsTabHref,
} from "./format";
import { CategoryBarChart } from "./components/charts";
import { StatTable, type StatColumn } from "./components/StatTable";

function monthCell(value: MonthValue | null): React.ReactNode {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {monthNameDe(value.month)}{" "}
      <span className="text-muted-foreground tabular-nums">
        ({formatMoney(value.net)})
      </span>
    </span>
  );
}

function changeCell(change: ComparisonResult): React.ReactNode {
  const described = describeComparison(change, "ggü. Vorjahr");
  const toneClass =
    described.tone === "positive"
      ? "text-positive"
      : described.tone === "negative"
        ? "text-negative"
        : "text-muted-foreground";
  return <span className={cn("text-sm", toneClass)}>{described.text}</span>;
}

export function YearsTab() {
  const { payments, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const stats = React.useMemo(() => yearStatistics(payments), [payments]);
  const chartData = React.useMemo(
    () =>
      yearlyBuckets(payments).map((bucket) => ({
        key: String(bucket.year),
        label: String(bucket.year),
        value: bucket.net.toChartNumber(),
        money: bucket.net,
        count: bucket.count,
        href: statisticsDrillHref(filter, { year: bucket.year }),
      })),
    [payments, filter],
  );

  const columns = React.useMemo<StatColumn<YearStatistics>[]>(
    () => [
      {
        key: "year",
        header: "Jahr",
        headerLabel: "Jahr",
        compare: (a, b) => a.year - b.year,
        render: (row) => <span className="font-medium">{row.year}</span>,
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
      {
        key: "depots",
        header: "Depots",
        headerLabel: "Anzahl Depots",
        align: "right",
        compare: (a, b) => a.distinctDepots - b.distinctDepots,
        render: (row) => formatCountNumber(row.distinctDepots),
      },
      {
        key: "average",
        header: "Ø Zahlung",
        headerLabel: "Durchschnittszahlung",
        align: "right",
        compare: (a, b) => a.averagePayment.compareTo(b.averagePayment),
        render: (row) => <AmountText amount={row.averagePayment} />,
      },
      {
        key: "best",
        header: "Bester Monat",
        render: (row) => monthCell(row.bestMonth),
      },
      {
        key: "worst",
        header: "Schwächster Monat",
        render: (row) => monthCell(row.worstMonth),
      },
      {
        key: "change",
        header: "Δ Vorjahr",
        render: (row) => changeCell(row.change),
      },
    ],
    [],
  );

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Jahresdaten"
        description="Für den aktuellen Filter liegen keine Dividendeneingänge vor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Jährliche Entwicklung</CardTitle>
          <p className="text-sm text-muted-foreground">
            Netto-Dividendensumme je Kalenderjahr, chronologisch.
          </p>
        </CardHeader>
        <CardContent>
          <CategoryBarChart
            data={chartData}
            ariaLabel="Netto-Dividenden je Jahr"
            categoryHeader="Jahr"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Jahresstatistik</CardTitle>
          <p className="text-sm text-muted-foreground">
            Neueste Jahre zuerst. Eine Zeile öffnet die Monate dieses Jahres.
          </p>
        </CardHeader>
        <CardContent>
          <StatTable
            rows={stats}
            columns={columns}
            getRowKey={(row) => String(row.year)}
            caption="Kennzahlen je Kalenderjahr"
            initialSort={{ key: "year", direction: "desc" }}
            onRowClick={(row) =>
              void navigate(
                statisticsTabHref("/statistiken/monate", filter, { year: row.year }),
              )
            }
            rowLabel={(row) => `Monate von ${String(row.year)} anzeigen`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
