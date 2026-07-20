import * as React from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import {
  MONTH_NAMES_DE_SHORT,
  overviewStatistics,
  yearlyBuckets,
  heatmapByYearMonth,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import {
  formatCountNumber,
  formatIsoDate,
  formatMonthYear,
  formatPayments,
  statisticsDrillHref,
} from "./format";
import { CategoryBarChart, PaymentsHeatmap } from "./components/charts";

export function OverviewTab() {
  const { payments, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const stats = React.useMemo(() => overviewStatistics(payments), [payments]);
  const { bestMonth, bestYear } = stats;

  const yearData = React.useMemo(
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

  const heatmap = React.useMemo(() => {
    const rows = heatmapByYearMonth(payments);
    let maxValue = 0;
    for (const row of rows) {
      for (const cell of row.months) {
        const value = cell.net.toChartNumber();
        if (value > maxValue) maxValue = value;
      }
    }
    return {
      rows: rows.map((row) => ({
        year: row.year,
        cells: row.months.map((month) => ({
          month: month.month,
          net: month.net,
          count: month.count,
          value: month.net.toChartNumber(),
        })),
      })),
      maxValue,
    };
  }, [payments]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Historische Gesamtsumme"
          value={<AmountText amount={stats.net} />}
          comparison={formatPayments(stats.count)}
          onDrillDown={() => void navigate(statisticsDrillHref(filter))}
        />
        <StatCard
          label="Ø Zahlung"
          value={<AmountText amount={stats.averagePayment} />}
          comparison="Durchschnitt je Zahlung"
        />
        <StatCard
          label="Ø Monat"
          value={<AmountText amount={stats.averageMonth} />}
          comparison={`über ${formatCountNumber(stats.activeMonths)} Monate mit Zahlungen`}
        />
        <StatCard
          label="Bester Monat"
          value={
            bestMonth ? (
              <AmountText amount={bestMonth.net} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
          {...(bestMonth
            ? {
                comparison: formatMonthYear(bestMonth.year, bestMonth.month),
                onDrillDown: () =>
                  void navigate(
                    statisticsDrillHref(filter, {
                      year: bestMonth.year,
                      month: bestMonth.month,
                    }),
                  ),
              }
            : {})}
        />
        <StatCard
          label="Bestes Jahr"
          value={
            bestYear ? (
              <AmountText amount={bestYear.net} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
          {...(bestYear
            ? {
                comparison: String(bestYear.year),
                onDrillDown: () =>
                  void navigate(statisticsDrillHref(filter, { year: bestYear.year })),
              }
            : {})}
        />
        <StatCard
          label="Unternehmen · Depots"
          value={`${formatCountNumber(stats.distinctSecurities)} · ${formatCountNumber(stats.distinctDepots)}`}
          comparison="ausschüttende Unternehmen und Depots"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Zeitraum</CardTitle>
          <p className="text-sm text-muted-foreground">
            {stats.firstPayDate && stats.lastPayDate
              ? `${formatIsoDate(stats.firstPayDate)} – ${formatIsoDate(stats.lastPayDate)}`
              : "Keine Dividendeneingänge im gewählten Filter."}
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Jährliche Entwicklung</CardTitle>
          <p className="text-sm text-muted-foreground">
            Netto-Dividendensumme je Kalenderjahr, chronologisch.
          </p>
        </CardHeader>
        <CardContent>
          <CategoryBarChart
            data={yearData}
            ariaLabel="Netto-Dividenden je Jahr"
            categoryHeader="Jahr"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Zahlungs-Heatmap</CardTitle>
          <p className="text-sm text-muted-foreground">
            Netto-Dividenden nach Jahr und Monat. Dunklere Felder stehen für höhere
            Summen.
          </p>
        </CardHeader>
        <CardContent>
          <PaymentsHeatmap
            rows={heatmap.rows}
            maxValue={heatmap.maxValue}
            monthLabels={MONTH_NAMES_DE_SHORT}
            hrefOf={(year, month) => statisticsDrillHref(filter, { year, month })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
