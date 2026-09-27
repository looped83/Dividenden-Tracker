import * as React from "react";
import { useNavigate } from "react-router";
import { StatCard, StatGrid } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { overviewStatistics } from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import {
  formatCountNoun,
  formatCountNumber,
  formatMonthYear,
  formatPayments,
  statisticsDrillHref,
} from "./format";
import { YearMonthMatrix } from "./YearMonthMatrix";
import { formatDateRange, formatYearSpan } from "@/lib/utils/formatDate";

export function OverviewTab() {
  const { payments, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const stats = React.useMemo(() => overviewStatistics(payments), [payments]);
  const { bestMonth, bestYear } = stats;

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
          caption={formatCountNoun(
            stats.distinctSecurities,
            "Unternehmen",
            "Unternehmen",
          )}
          onDrillDown={() => void navigate(statisticsDrillHref(filter))}
        />
        <StatCard
          label="Ø Zahlung"
          value={<AmountText amount={stats.averagePayment} />}
          caption={formatPayments(stats.count)}
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

      {/* Die Matrix aus Jahren und Monaten — hier trifft sich die fruehere
          Heatmap (Toenung) mit dem frueheren Reiter „Breakdown" (Zahlen). Das
          Jahresdiagramm stand zuvor hier **und** unter „Jahre"; es steht jetzt
          nur noch unter „Verlauf". */}
      <YearMonthMatrix />
    </div>
  );
}
