import * as React from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import {
  MONTH_NAMES_DE_SHORT,
  overviewStatistics,
  yearlyBuckets,
  heatmapByYearMonth,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import {
  formatCountNoun,
  formatCountNumber,
  formatMonthYear,
  formatPayments,
  statisticsDrillHref,
} from "./format";
import { CategoryBarChart, PaymentsHeatmap } from "./components/charts";
import { formatDateRange, formatYearSpan } from "@/lib/utils/formatDate";

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
      {/* Zwei Kacheln je Zeile schon auf dem Telefon — wie in der Uebersicht:
          Sechs Kennzahlen untereinander schoben Diagramm und Heatmap aus dem
          Bild. */}
      <StatGrid columns={3}>
        <StatCard
          label="Gesamtsumme"
          value={<AmountText amount={stats.net} />}
          // Die Zahl der Zahlungen nennt „Ø Zahlung" daneben; hier steht die
          // Breite, aus der die Summe stammt.
          // Je eine Zeile: Mit „·" verbunden brach die Angabe in der
          // halbbreiten Kachel mitten im Satz um (wie in der Uebersicht).
          caption={
            <>
              <p>
                {formatCountNoun(stats.distinctSecurities, "Unternehmen", "Unternehmen")}
              </p>
              <p>{formatCountNoun(stats.distinctDepots, "Depot", "Depots")}</p>
            </>
          }
          onDrillDown={() => void navigate(statisticsDrillHref(filter))}
        />
        <StatCard
          label="Ø Zahlung"
          value={<AmountText amount={stats.averagePayment} />}
          caption={`aus ${formatPayments(stats.count)}`}
        />
        <StatCard
          label="Ø Monat"
          value={<AmountText amount={stats.averageMonth} />}
          caption={`${formatCountNumber(stats.activeMonths)} Monate`}
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
                caption: formatMonthYear(bestMonth.year, bestMonth.month),
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
                caption: String(bestYear.year),
                onDrillDown: () =>
                  void navigate(statisticsDrillHref(filter, { year: bestYear.year })),
              }
            : {})}
        />
        <StatCard
          label="Zeitraum"
          value={
            stats.firstPayDate && stats.lastPayDate ? (
              formatYearSpan(stats.firstPayDate, stats.lastPayDate)
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
          caption={
            stats.firstPayDate && stats.lastPayDate
              ? formatDateRange(stats.firstPayDate, stats.lastPayDate)
              : undefined
          }
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Jährliche Entwicklung</CardTitle>
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
        <CardHeader>
          <CardTitle>Zahlungs-Heatmap</CardTitle>
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
