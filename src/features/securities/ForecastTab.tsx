import { KpiHero, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Section, SectionLink } from "@/components/ui/section";
import { EUR, Money, MoneyDecimal, formatMoneyWhole, formatPercent } from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate } from "./ForecastGate";
import type { TwelveMonthForecast } from "./forecast";

const HUNDRED = new MoneyDecimal(100);

/**
 * Unterbereich **Prognose** des Bestands: Was kommt in den naechsten zwoelf
 * Monaten?
 *
 * Alle Zahlen hier sind **Schaetzungen** und als solche beschriftet. Sie
 * entstehen beim Anzeigen aus Depotstand und erfassten Zahlungen
 * (dieselben Abfragen und derselbe Cache wie die uebrigen Bereiche) und werden
 * nie gespeichert (CALCULATION_RULES.md §14, PRODUCT_SPEC.md Grundsatz 8).
 *
 * Monatsluecken und Schneeball standen bis 2.19 hier; sie rechnen durch, was
 * waere, wenn du kaufst oder sparst, und stehen seit 2.20.0 im Planer. Ein
 * Verweis im Kopf des Diagramms fuehrt zu den Luecken.
 */
export function ForecastTab() {
  return (
    <ForecastGate emptyDescription="Die Prognose schätzt deine Dividenden der nächsten zwölf Monate. Dafür braucht sie einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {({ forecast }) => (
        <div className="space-y-10 lg:space-y-12">
          <ForecastSummary forecast={forecast} />

          <Section title="Nächste 12 Monate" action={<GapsLink forecast={forecast} />}>
            <CategoryBarChart
              data={toBarData(forecast)}
              ariaLabel="Erwartete Nettodividende je Monat der nächsten zwölf Monate"
              categoryHeader="Monat"
              color="primary"
              showCount={false}
              emptyMessage="Für die nächsten zwölf Monate ist nichts zu erwarten."
            />
          </Section>
        </div>
      )}
    </ForecastGate>
  );
}

/**
 * Ruhiger Verweis auf Planer › Optimierungen im Kopf des Diagramms, nur wenn
 * es Lücken gibt.
 */
function GapsLink({ forecast }: { forecast: TwelveMonthForecast }) {
  const average = forecast.total.toDecimal().dividedBy(12);
  const below = forecast.months.filter((month) =>
    month.total.toDecimal().lessThan(average),
  ).length;
  if (below === 0) return null;
  return (
    <SectionLink to="/planer/luecken">
      {formatCountNoun(below, "Monat", "Monate")} unter Ø
    </SectionLink>
  );
}

function ForecastSummary({ forecast }: { forecast: TwelveMonthForecast }) {
  const first = forecast.months[0];
  const last = forecast.months[forecast.months.length - 1];
  const average = Money.fromDecimal(forecast.total.toDecimal().dividedBy(12), EUR);
  const strongest = forecast.months.reduce((best, month) =>
    month.total.compareTo(best.total) > 0 ? month : best,
  );
  const received = forecast.receivedLast12;
  const change = received.isZero()
    ? null
    : forecast.total
        .toDecimal()
        .minus(received.toDecimal())
        .dividedBy(received.toDecimal())
        .times(HUNDRED);

  return (
    <KpiHero
      label="Erwartet in 12 Monaten · netto"
      value={<AmountText amount={forecast.total} />}
      trend={
        change ? (
          <TrendPill
            tone={
              change.isNegative() ? "negative" : change.isZero() ? "neutral" : "positive"
            }
            title="Gegenüber den letzten zwölf Monaten"
          >
            {formatPercent(change.abs(), 1)}
          </TrendPill>
        ) : undefined
      }
      caption={`${monthNameDeShort(first.month)} ${String(first.year)} – ${monthNameDeShort(last.month)} ${String(last.year)} · Ø ${formatMoneyWhole(average)} im Monat`}
      stats={[
        {
          label: "Erhalten",
          value: <AmountText amount={received} />,
          caption: "letzte 12 Monate",
        },
        {
          label: "Stärkster Monat",
          value: `${monthNameDe(strongest.month)} ${String(strongest.year)}`,
          caption: formatMoneyWhole(strongest.total),
        },
      ]}
    />
  );
}

const TOOLTIP_PAYERS = 3;

function toBarData(forecast: TwelveMonthForecast): CategoryDatum[] {
  return forecast.months.map((month) => ({
    key: `${String(month.year)}-${String(month.month)}`,
    label: monthNameDeShort(month.month),
    detail: `${monthNameDe(month.month)} ${String(month.year)}`,
    value: month.total.toChartNumber(),
    money: month.total,
    count: month.contributions.length,
    breakdown: month.contributions
      .slice(0, TOOLTIP_PAYERS)
      .map((item) => ({ name: item.name, money: item.amount })),
  }));
}
