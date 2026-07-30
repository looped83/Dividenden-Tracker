import * as React from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { EmptyState } from "@/components/ui/empty-state";
import {
  calendarMonthBuckets,
  monthAcrossYearsStatistics,
  monthNameDe,
  MONTH_NAMES_DE_SHORT,
  type MonthAcrossYearsStatistics,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import { formatCountNumber, statisticsDrillHref } from "./format";
import { CategoryBarChart } from "./components/charts";
import { StatTable, type StatColumn } from "./components/StatTable";

export function MonthsTab() {
  const { payments, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const stats = React.useMemo(() => monthAcrossYearsStatistics(payments), [payments]);

  const chartData = React.useMemo(
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

  const columns = React.useMemo<StatColumn<MonthAcrossYearsStatistics>[]>(
    () => [
      {
        key: "month",
        header: "Monat",
        headerLabel: "Monat",
        compare: (a, b) => a.month - b.month,
        render: (row) => <span className="font-medium">{monthNameDe(row.month)}</span>,
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
        key: "average",
        header: "Ø Zahlung",
        headerLabel: "Durchschnittszahlung",
        align: "right",
        compare: (a, b) => a.averagePayment.compareTo(b.averagePayment),
        render: (row) => <AmountText amount={row.averagePayment} />,
      },
    ],
    [],
  );

  if (payments.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Monatsdaten"
        description="Für den aktuellen Filter liegen keine Dividendeneingänge vor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Monatliche Entwicklung</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBarChart
            data={chartData}
            ariaLabel="Netto-Dividenden je Kalendermonat"
            categoryHeader="Monat"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Monatsstatistik</CardTitle>
        </CardHeader>
        <CardContent>
          <StatTable
            rows={stats}
            columns={columns}
            getRowKey={(row) => String(row.month)}
            caption="Kennzahlen je Kalendermonat über alle Jahre"
            onRowClick={(row) =>
              void navigate(statisticsDrillHref(filter, { month: row.month }))
            }
            rowLabel={(row) => `Alle Zahlungen im ${monthNameDe(row.month)} anzeigen`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
