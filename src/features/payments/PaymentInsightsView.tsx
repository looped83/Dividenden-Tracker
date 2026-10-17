import { Link } from "react-router";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { Section, SectionLink } from "@/components/ui/section";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { AmountText } from "@/components/money/AmountText";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthNameDe, monthNameDeShort, monthOf, yearOf } from "@/lib/statistics";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import type { Delta, PaymentInsights } from "@/features/payments/paymentInsights";

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
 * Der Verlauf ist bewusst kein Diagramm aus der Statistik (Recharts), sondern
 * eine Reihe schlichter Balken aus CSS: zwoelf Werte brauchen weder Achsen
 * noch Tooltips, und die Detailseite laedt so keine Diagrammbibliothek nach.
 * Jeder Balken ist ein Link zu seiner Dividende — man blaettert durch die
 * Historie, ohne zur Liste zurueckzumuessen.
 */
export function PaymentInsightsView({
  insights,
  paymentId,
  securityId,
  securityName,
  listState,
}: {
  insights: PaymentInsights;
  paymentId: string;
  securityId: string;
  securityName: string;
  /** Rueckweg zur Liste, an die naechste Detailseite weitergereicht. */
  listState: string | undefined;
}) {
  const { previous, trailingAverage, history } = insights;

  const stats: KpiStat[] = [];
  if (previous) {
    stats.push({
      label: "Vorherige",
      value: <AmountText amount={previous.reference} />,
      caption: <DeltaText delta={previous} />,
      to: `/eingaenge/${previous.id}`,
      drillLabel: `Vorherige Dividende vom ${formatCalendarDate(previous.date)} öffnen`,
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

  // Rein visuelle Hoehe (toChartNumber, §1) — gerechnet wird damit nichts.
  const maxValue = Math.max(
    0,
    ...history.map((entry) => entry.netAmount.toChartNumber()),
  );

  return (
    <>
      {stats.length > 0 && <KpiStats stats={stats} />}

      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
        {history.length > 1 && (
          <Section
            title="Verlauf"
            description={`${formatCountNoun(history.length, "Dividende", "Dividenden")} von ${securityName}`}
            action={
              <SectionLink to={`/eingaenge?security=${securityId}`}>
                Alle {formatCountNumber(insights.count)}
              </SectionLink>
            }
          >
            <ol
              aria-label={`Verlauf der Dividenden von ${securityName}`}
              className="flex h-36 items-stretch gap-1 pt-6"
            >
              {history.map((entry, index) => {
                const current = entry.id === paymentId;
                const height =
                  maxValue > 0 ? (entry.netAmount.toChartNumber() / maxValue) * 100 : 0;
                const label = `${formatCalendarDate(entry.actualPayDate)}: ${formatMoney(entry.netAmount)}`;
                const bar = (
                  <span
                    className={cn(
                      "relative block w-full rounded-t-md transition-colors motion-reduce:transition-none",
                      current
                        ? "bg-primary"
                        : "bg-foreground/15 group-hover:bg-foreground/30",
                    )}
                    style={{ height: `${String(Math.max(height, 4))}%` }}
                  >
                    {current && (
                      <span
                        className={cn(
                          "absolute -top-5 whitespace-nowrap text-[0.6875rem] font-semibold tabular-amount",
                          // Am Rand buendig statt mittig, sonst ragt der
                          // Betrag ueber den Balken des Randes hinaus.
                          index === 0
                            ? "left-0"
                            : index === history.length - 1
                              ? "right-0"
                              : "left-1/2 -translate-x-1/2",
                        )}
                      >
                        {formatMoney(entry.netAmount)}
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={entry.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {current ? (
                      <span
                        aria-current="page"
                        aria-label={label}
                        className="flex flex-1 items-end"
                      >
                        {bar}
                      </span>
                    ) : (
                      <Link
                        to={`/eingaenge/${entry.id}`}
                        state={{ from: listState }}
                        aria-label={label}
                        title={label}
                        className="group flex flex-1 items-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {bar}
                      </Link>
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "truncate text-center text-[0.6875rem]",
                        current
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {monthNameDeShort(monthOf(entry.payDate))}
                    </span>
                  </li>
                );
              })}
            </ol>
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
