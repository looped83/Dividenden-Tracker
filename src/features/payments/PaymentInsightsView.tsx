import * as React from "react";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { Section, SectionLink } from "@/components/ui/section";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent } from "@/lib/money";
import { monthNameDe, monthNameDeShort, monthOf, yearOf } from "@/lib/statistics";
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

function Row({
  label,
  caption,
  children,
}: {
  label: string;
  /** Zusatz unter dem Wert, gedaempft — statt einer zweiten Zeile mit eigener Beschriftung. */
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 text-[0.9375rem] last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-amount">
        {children}
        {caption !== undefined && (
          <span className="block text-[0.8125rem] text-muted-foreground">{caption}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Die Einordnung einer Dividende: Vergleich, Verlauf, Summen.
 *
 * Der Verlauf ist dasselbe Balkendiagramm wie in Statistik und auf der
 * Assetseite (seit 1.26.0; zuvor eigene CSS-Balken) — gleiche Achsen, gleicher
 * Tooltip, gleiche Datentabelle. Die geoeffnete Dividende steht in der
 * Akzentfarbe; die Balken fuehren bewusst nirgendwohin, der Tooltip zeigt
 * Datum und Betrag.
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

  const chartData = React.useMemo<CategoryDatum[]>(
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

  return (
    <>
      {stats.length > 0 && <KpiStats stats={stats} />}

      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
        {chartData.length > 1 && (
          <Section
            title="Verlauf"
            action={
              <SectionLink to={`/eingaenge?security=${securityId}`}>
                Alle {formatCountNumber(insights.count)}
              </SectionLink>
            }
          >
            <div>
              <CategoryBarChart
                data={chartData}
                ariaLabel={`Verlauf der Dividenden von ${securityName}`}
                categoryHeader="Datum"
                showCount={false}
              />
            </div>
          </Section>
        )}

        <Section title="Einordnung">
          <dl>
            <Row
              label={`Im Jahr ${String(insights.year.year)}`}
              caption={formatCountNoun(insights.year.count, "Dividende", "Dividenden")}
            >
              <AmountText amount={insights.year.net} />
            </Row>
            <Row
              label="Insgesamt"
              caption={`${formatCountNoun(insights.count, "Dividende", "Dividenden")} seit ${monthNameDeShort(monthOf(insights.firstDate))} ${String(yearOf(insights.firstDate))}`}
            >
              <AmountText amount={insights.total} />
            </Row>
            {insights.nextExpected && (
              <Row label="Nächste erwartet">
                {monthNameDe(monthOf(insights.nextExpected))}{" "}
                {String(yearOf(insights.nextExpected))}
              </Row>
            )}
          </dl>
        </Section>
      </div>
    </>
  );
}
