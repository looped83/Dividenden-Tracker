import * as React from "react";
import { KpiHero } from "@/components/domain/KpiHero";
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
import { formatYearSpan } from "@/lib/utils/formatDate";

export function OverviewTab() {
  const { payments, filter } = useStatisticsContext();

  const stats = React.useMemo(() => overviewStatistics(payments), [payments]);
  const { bestMonth, bestYear } = stats;

  return (
    <div className="space-y-6">
      {/* Die Gesamtsumme ist die Hauptzahl; Zeitraum, Zahl der Zahlungen und
          Breite stehen in ihrer Unterzeile. Darunter drei Nebenkennzahlen statt
          fuenf weiterer Kacheln — sechs gleich grosse schoben die Matrix auf
          dem Telefon aus dem ersten Bildschirm. */}
      <KpiHero
        label="Gesamtsumme"
        value={<AmountText amount={stats.net} />}
        to={statisticsDrillHref(filter)}
        drillLabel="Alle Zahlungen dieser Auswahl anzeigen"
        caption={[
          stats.firstPayDate && stats.lastPayDate
            ? formatYearSpan(stats.firstPayDate, stats.lastPayDate)
            : null,
          formatPayments(stats.count),
          formatCountNoun(stats.distinctSecurities, "Unternehmen", "Unternehmen"),
        ]
          .filter(Boolean)
          .join(" · ")}
        stats={[
          {
            label: "Ø Monat",
            value: <AmountText amount={stats.averageMonth} />,
            caption: `${formatCountNumber(stats.activeMonths)} Monate`,
          },
          {
            label: "Bestes Jahr",
            value: bestYear ? <AmountText amount={bestYear.net} /> : "—",
            caption: bestYear ? String(bestYear.year) : undefined,
            to: bestYear
              ? statisticsDrillHref(filter, { year: bestYear.year })
              : undefined,
            drillLabel: "Zahlungen des besten Jahres anzeigen",
          },
          {
            label: "Bester Monat",
            value: bestMonth ? <AmountText amount={bestMonth.net} /> : "—",
            caption: bestMonth
              ? formatMonthYear(bestMonth.year, bestMonth.month)
              : undefined,
            to: bestMonth
              ? statisticsDrillHref(filter, {
                  year: bestMonth.year,
                  month: bestMonth.month,
                })
              : undefined,
            drillLabel: "Zahlungen des besten Monats anzeigen",
          },
        ]}
      />

      {/* Die Matrix aus Jahren und Monaten — hier trifft sich die fruehere
          Heatmap (Toenung) mit dem frueheren Reiter „Breakdown" (Zahlen). Das
          Jahresdiagramm stand zuvor hier **und** unter „Jahre"; es steht jetzt
          nur noch unter „Verlauf". */}
      <YearMonthMatrix />
    </div>
  );
}
