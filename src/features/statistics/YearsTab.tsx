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
import { formatMoney, formatPercent } from "@/lib/money";
import { useToday } from "@/lib/hooks/useToday";
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

function changeCell(change: ComparisonResult, context: string): React.ReactNode {
  const described = describeComparison(change, context);
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
  const today = useToday();

  const stats = React.useMemo(() => yearStatistics(payments, today), [payments, today]);
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
        render: (row) => (
          <span className="font-medium">
            {row.year}
            {row.year === today.year && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                läuft
              </span>
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
        listHidden: true,
        header: "Assets",
        headerLabel: "Anzahl Assets",
        align: "right",
        compare: (a, b) => a.distinctSecurities - b.distinctSecurities,
        render: (row) => formatCountNumber(row.distinctSecurities),
      },
      {
        key: "depots",
        listHidden: true,
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
        // Das laufende Jahr steht gegen denselben Ausschnitt des Vorjahres
        // (§11.3) — die Beschriftung sagt es.
        render: (row) =>
          changeCell(
            row.change,
            row.year === today.year ? "ggü. Vorjahreszeitraum" : "ggü. Vorjahr",
          ),
      },
    ],
    [today.year],
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
        <CardHeader>
          <CardTitle>Jährliche Entwicklung</CardTitle>
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
        <CardHeader>
          <CardTitle>Jahresstatistik</CardTitle>
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
                statisticsTabHref(
                  "/statistiken/verlauf",
                  filter,
                  { year: row.year },
                  { nach: "monate" },
                ),
              )
            }
            rowLabel={(row) => `Monate von ${String(row.year)} anzeigen`}
            listSummary={{
              meta: (row) => {
                const { change } = row;
                const trend =
                  change.kind === "percent" ? (
                    <span
                      className={cn(
                        "font-medium",
                        change.absolute.isNegative() && "text-negative",
                        change.absolute.isPositive() && "text-positive",
                      )}
                    >
                      {change.percent.isPositive() ? "+" : ""}
                      {formatPercent(change.percent)}
                      {row.year === today.year ? " bis heute" : ""}
                    </span>
                  ) : null;
                return (
                  <>
                    {trend}
                    {trend && " · "}
                    {formatCountNumber(row.count)} Zahlungen
                    {row.bestMonth && ` · stärkster ${monthNameDe(row.bestMonth.month)}`}
                  </>
                );
              },
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
