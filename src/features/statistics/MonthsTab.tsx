import * as React from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { ListTile } from "@/components/ui/list";
import { AmountText } from "@/components/money/AmountText";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/ui/empty-state";
import {
  calendarMonthBuckets,
  monthAcrossYearsStatistics,
  monthNameDe,
  monthNameDeShort,
  MONTH_NAMES_DE_SHORT,
  type MonthAcrossYearsStatistics,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import { formatCountNumber, formatPayments, statisticsDrillHref } from "./format";
import { CategoryBarChart } from "./components/charts";
import { StatTable, type StatColumn } from "./components/StatTable";

export function MonthsTab({
  switcher,
}: {
  /** Umschalter Jahre/Monate — rechts im Kopf des Diagramms, wie auf der Übersicht. */
  switcher?: React.ReactNode;
}) {
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
        header: "Anzahl",
        headerLabel: "Anzahl Dividenden",
        align: "right",
        compare: (a, b) => a.count - b.count,
        render: (row) => formatCountNumber(row.count),
      },
      {
        key: "average",
        header: "Ø Dividende",
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
        description="Für den aktuellen Filter liegen keine Dividenden vor."
      />
    );
  }

  return (
    <div className="space-y-10">
      <Section
        title="Entwicklung"
        {...(switcher !== undefined && { action: switcher, actionClassName: "shrink-0" })}
      >
        <div>
          <CategoryBarChart
            data={chartData}
            color="primary"
            ariaLabel="Netto-Dividenden je Kalendermonat"
            categoryHeader="Monat"
          />
        </div>
      </Section>

      <StatTable
        title="Monatsstatistik"
        rows={stats}
        columns={columns}
        getRowKey={(row) => String(row.month)}
        caption="Kennzahlen je Kalendermonat über alle Jahre"
        onRowClick={(row) =>
          void navigate(statisticsDrillHref(filter, { month: row.month }))
        }
        rowLabel={(row) => `Alle Dividenden im ${monthNameDe(row.month)} anzeigen`}
        listSummary={{
          // Der Monat als Kachel vorn — wie im Vergleich und bei den Jahren.
          leading: (row) => <ListTile primary={monthNameDeShort(row.month)} />,
          title: (row) => formatPayments(row.count),
          meta: (row) => `Ø ${formatMoney(row.averagePayment)} je Dividende`,
        }}
      />
    </div>
  );
}
