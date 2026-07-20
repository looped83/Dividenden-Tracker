import * as React from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { cn } from "@/lib/utils/cn";
import type { AnalyticsPayment, YearSelection } from "@/lib/statistics";
import {
  averagePerMonth,
  bestMonthAllTime,
  bestMonthInYear,
  comparePeriods,
  currentMonthAggregate,
  currentMonthComparison,
  distinctDepots,
  distinctSecurities,
  historicalSummary,
  selectedPeriodAggregate,
  selectedYearComparison,
  yearOf,
  type RefDate,
} from "@/lib/statistics";
import {
  describeComparison,
  describeSelection,
  formatIsoDate,
  formatMonthYear,
  paymentsListHref,
  type ComparisonTone,
} from "./format";

const countFormatter = new Intl.NumberFormat("de-DE");
function formatCount(count: number, noun: string, pluralNoun = `${noun}en`): string {
  return `${countFormatter.format(count)} ${count === 1 ? noun : pluralNoun}`;
}

const toneClass: Record<ComparisonTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted-foreground",
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  caption?: string | undefined;
  footnote?: React.ReactNode | undefined;
  comparison?: { text: string; tone: ComparisonTone } | undefined;
  to?: string | undefined;
  drillLabel?: string | undefined;
}

function KpiCard({
  label,
  value,
  caption,
  footnote,
  comparison,
  to,
  drillLabel,
}: KpiCardProps) {
  const body = (
    <>
      <div className="text-2xl font-semibold tabular-amount">{value}</div>
      {caption && <div className="mt-1 text-xs text-muted-foreground">{caption}</div>}
    </>
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-2">
        {to ? (
          <Link
            to={to}
            aria-label={drillLabel ?? label}
            className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        )}
        <div className="space-y-0.5">
          {comparison && (
            <p className={cn("text-sm", toneClass[comparison.tone])}>{comparison.text}</p>
          )}
          {footnote && <div className="text-xs text-muted-foreground">{footnote}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface KpiCardsProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/** Bis zu sechs primaere Kennzahlkarten (§5). */
export function KpiCards({ payments, selection, today }: KpiCardsProps) {
  const cards = React.useMemo(() => {
    const ref = today;
    const isAll = selection === "all";
    const isCurrentYear = selection === ref.year;

    // 5.1 Ausgewaehlter Zeitraum
    const selectedAgg = selectedPeriodAggregate(payments, selection);
    const { current, prior } = selectedYearComparison(payments, selection, ref);
    const contextLabel = isCurrentYear
      ? "ggü. gleichem Vorjahreszeitraum"
      : "ggü. Vorjahr";
    const selectedComparison = isAll
      ? undefined
      : describeComparison(comparePeriods(current, prior), contextLabel);

    // 5.2 Aktueller Monat (immer, unabhaengig von der Jahresauswahl)
    const monthAgg = currentMonthAggregate(payments, ref);
    const monthCompare = currentMonthComparison(payments, ref);
    const monthComparison = describeComparison(
      comparePeriods(monthCompare.current, monthCompare.prior),
      "ggü. gleichem Vorjahreszeitraum",
    );

    // 5.3 Historische Gesamtsumme (immer alle aktiven Eingaenge)
    const history = historicalSummary(payments);

    // 5.5 Bester Monat
    const best = isAll
      ? bestMonthAllTime(payments)
      : bestMonthInYear(payments, selection);

    // 5.6 Ausschuettende Unternehmen im Zeitraum
    const periodPayments = isAll
      ? payments
      : payments.filter((p) => yearOf(p.payDate) === selection);
    const companies = distinctSecurities(periodPayments);
    const depots = distinctDepots(periodPayments);

    return {
      isAll,
      isCurrentYear,
      selectedAgg,
      selectedComparison,
      monthAgg,
      monthComparison,
      history,
      best,
      companies,
      depots,
    };
  }, [payments, selection, today]);

  const selectionLabel = describeSelection(selection);
  const currentMonthLabel = formatMonthYear(today.year, today.month);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 5.1 Dividenden im ausgewaehlten Zeitraum */}
      <KpiCard
        label={`Dividenden ${selectionLabel}`}
        value={<AmountText amount={cards.selectedAgg.net} />}
        caption={formatCount(cards.selectedAgg.count, "Zahlung", "Zahlungen")}
        comparison={cards.selectedComparison}
        to={paymentsListHref({ year: selection })}
        drillLabel={`Zahlungen ${selectionLabel} anzeigen`}
      />

      {/* 5.2 Aktueller Monat */}
      <KpiCard
        label={`Aktueller Monat (${currentMonthLabel})`}
        value={<AmountText amount={cards.monthAgg.net} />}
        caption={`${formatCount(cards.monthAgg.count, "Zahlung", "Zahlungen")} · bis ${String(today.day)}.`}
        comparison={cards.monthComparison}
        to={paymentsListHref({ year: today.year, month: today.month })}
        drillLabel="Zahlungen des aktuellen Monats anzeigen"
      />

      {/* 5.3 Historische Gesamtsumme */}
      <KpiCard
        label="Historisch erhaltene Dividenden"
        value={<AmountText amount={cards.history.net} />}
        caption={formatCount(cards.history.count, "Zahlung", "Zahlungen")}
        footnote={
          cards.history.firstPayDate && cards.history.lastPayDate
            ? `${formatIsoDate(cards.history.firstPayDate)} – ${formatIsoDate(cards.history.lastPayDate)}`
            : undefined
        }
        to={paymentsListHref({})}
        drillLabel="Gesamte Dividendenhistorie anzeigen"
      />

      {/* 5.4 Durchschnitt pro Monat (nur Einzeljahr) */}
      {!cards.isAll && typeof selection === "number" && (
        <KpiCard
          label="Ø pro Monat"
          value={<AmountText amount={averagePerMonth(payments, selection, today)} />}
          caption={
            cards.isCurrentYear
              ? "Durchschnitt pro begonnenem Monat"
              : "Durchschnitt pro Monat"
          }
        />
      )}

      {/* 5.5 Bester Monat */}
      <KpiCard
        label={cards.isAll ? "Bester Monat (gesamt)" : "Bester Monat"}
        value={
          cards.best ? (
            <AmountText amount={cards.best.net} />
          ) : (
            <span className="text-muted-foreground">Keine Zahlungen</span>
          )
        }
        caption={
          cards.best ? formatMonthYear(cards.best.year, cards.best.month) : undefined
        }
        to={
          cards.best
            ? paymentsListHref({ year: cards.best.year, month: cards.best.month })
            : undefined
        }
        drillLabel="Zahlungen des besten Monats anzeigen"
      />

      {/* 5.6 Ausschuettende Unternehmen */}
      <KpiCard
        label="Ausschüttende Unternehmen"
        value={countFormatter.format(cards.companies)}
        caption={formatCount(cards.depots, "Depot", "Depots")}
      />
    </div>
  );
}
