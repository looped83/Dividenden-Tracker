import * as React from "react";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { Section } from "@/components/ui/section";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent } from "@/lib/money";
import { monthNameDeShort, monthOf, yearOf } from "@/lib/statistics";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import {
  deltaOf as delta,
  type Delta,
  type PaymentInsights,
} from "@/features/payments/paymentInsights";

/** „▲ 7,8 %" in Gruen, „▼ 2,1 %" in Rot, „±0 %" gedaempft. */
function DeltaText({ delta }: { delta: Delta }) {
  if (delta.percent === null) return <span>—</span>;
  const direction = delta.difference.isPositive()
    ? "up"
    : delta.difference.isNegative()
      ? "down"
      : null;
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-medium tabular-amount",
        direction === "up" && "text-positive",
        direction === "down" && "text-negative",
      )}
    >
      {direction ? <TrendTriangle direction={direction} announce /> : "±"}
      {formatPercent(delta.percent.abs())}
    </span>
  );
}

type HistoryView = "payments" | "years";

const VIEW_OPTIONS: readonly SegmentOption<HistoryView>[] = [
  { value: "payments", label: "Dividenden" },
  { value: "years", label: "Jahre" },
];

/**
 * Die Einordnung einer Dividende: Vergleich, Verlauf, Summen.
 *
 * Der Verlauf ist dasselbe Balkendiagramm wie in Statistik und auf der
 * Assetseite (seit 1.26.0; zuvor eigene CSS-Balken) — gleiche Achsen, gleicher
 * Tooltip, gleiche Datentabelle. Die geoeffnete Dividende steht in der
 * Akzentfarbe; die Balken fuehren bewusst nirgendwohin, der Tooltip zeigt
 * Datum und Betrag. Der Umschalter zeigt dieselbe Historie je Jahr (seit
 * 1.27.0), mit dem Jahr dieser Dividende hervorgehoben.
 */
export function PaymentInsightsView({
  insights,
  paymentId,
  securityId,
  securityName,
}: {
  insights: PaymentInsights;
  paymentId: string;
  securityId: string;
  securityName: string;
}) {
  const { previous, yearAgo, trailingAverage, history } = insights;

  const stats: KpiStat[] = [];
  // Erste Kachel je nach Rhythmus (Ausschuettungsplan des Assets): monatlich
  // die vorherige Dividende, sonst dieselbe Dividende ein Jahr zuvor.
  if (insights.monthly) {
    if (previous) {
      stats.push({
        label: "Vorherige",
        value: <AmountText amount={previous.reference} />,
        caption: <DeltaText delta={previous} />,
      });
    }
  } else if (yearAgo) {
    stats.push({
      label: "Vorjahr",
      value: <AmountText amount={yearAgo.previousAmount} />,
      caption: <DeltaText delta={delta(yearAgo.difference, yearAgo.previousAmount)} />,
    });
  }
  if (trailingAverage) {
    stats.push({
      label: "Ø 12 Monate",
      value: <AmountText amount={trailingAverage.reference} />,
      caption: <DeltaText delta={trailingAverage} />,
    });
  }
  if (insights.count > 1) {
    stats.push({
      label: "Rang",
      value: `${formatCountNumber(insights.rank)}. von ${formatCountNumber(insights.count)}`,
      caption:
        insights.rank === 1
          ? "Höchste bisher"
          : insights.rank === insights.count
            ? "Niedrigste bisher"
            : "nach Betrag",
    });
  }

  const [view, setView] = React.useState<HistoryView>("payments");

  const paymentData = React.useMemo<CategoryDatum[]>(
    () =>
      history.map((entry) => ({
        key: entry.id,
        label: monthNameDeShort(monthOf(entry.payDate)),
        detail: formatCalendarDate(entry.actualPayDate),
        value: entry.netAmount.toChartNumber(),
        money: entry.netAmount,
        count: 1,
        highlight: entry.id === paymentId,
      })),
    [history, paymentId],
  );

  const yearData = React.useMemo<CategoryDatum[]>(
    () =>
      insights.perYear.map((bucket) => ({
        key: String(bucket.year),
        label: String(bucket.year),
        value: bucket.net.toChartNumber(),
        money: bucket.net,
        count: bucket.count,
        highlight: bucket.year === insights.year.year,
      })),
    [insights.perYear, insights.year.year],
  );

  // Die Jahressicht lohnt erst ab zwei Jahren; sonst entfaellt der Umschalter.
  const hasYears = yearData.length > 1;
  const shown = hasYears ? view : "payments";

  const summary: KpiStat[] = [
    {
      label: `Im Jahr ${String(insights.year.year)}`,
      value: <AmountText amount={insights.year.net} />,
      caption: formatCountNoun(insights.year.count, "Dividende", "Dividenden"),
      to: `/eingaenge?security=${securityId}&year=${String(insights.year.year)}`,
      drillLabel: `Dividenden von ${securityName} im Jahr ${String(insights.year.year)} anzeigen`,
    },
    {
      label: "Insgesamt",
      value: <AmountText amount={insights.total} />,
      caption: `seit ${monthNameDeShort(monthOf(insights.firstDate))} ${String(yearOf(insights.firstDate))}`,
      to: `/eingaenge?security=${securityId}`,
      drillLabel: `Alle ${formatCountNumber(insights.count)} Dividenden von ${securityName} anzeigen`,
    },
  ];
  if (insights.nextExpected) {
    summary.push({
      label: "Nächste",
      value: `${monthNameDeShort(monthOf(insights.nextExpected))} ${String(yearOf(insights.nextExpected))}`,
      caption: "laut Plan",
    });
  }

  return (
    <>
      {stats.length > 0 && <KpiStats stats={stats} />}

      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
        {paymentData.length > 1 && (
          <Section
            title="Verlauf"
            action={
              hasYears ? (
                <SegmentedControl
                  variant="pill"
                  label="Verlauf nach"
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                />
              ) : undefined
            }
          >
            <div>
              {shown === "payments" ? (
                <CategoryBarChart
                  data={paymentData}
                  ariaLabel={`Dividenden von ${securityName}`}
                  categoryHeader="Datum"
                  showCount={false}
                  tableOrder="desc"
                />
              ) : (
                <CategoryBarChart
                  data={yearData}
                  ariaLabel={`Dividenden von ${securityName} je Jahr`}
                  categoryHeader="Jahr"
                  tableOrder="desc"
                />
              )}
            </div>
          </Section>
        )}

        {/* Dieselbe Kennzahlleiste wie oben statt einer Zeilenliste: Summen
            sind Kennzahlen, und die Leiste fuehrt per Tipp in die Liste. */}
        <Section title="Einordnung">
          <KpiStats stats={summary} />
        </Section>
      </div>
    </>
  );
}
