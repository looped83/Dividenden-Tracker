import * as React from "react";
import { StatCard, StatGrid } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { NOT_AVAILABLE } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
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
  selectedPeriodAggregate,
  selectedYearComparison,
  yearOf,
  type RefDate,
} from "@/lib/statistics";
import {
  describeSelection,
  formatMonthYear,
  paymentsListHref,
  type ComparisonTone,
  splitComparison,
} from "./format";

const toneClass: Record<ComparisonTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted-foreground",
};

/**
 * Vergleichszeile einer Kachel. Betrag und Prozent je in eigener Zeile:
 * Hintereinander brach „+12,34 € · +5,0 % ggü. Vorjahr" in der halbbreiten
 * Kachel mitten im Satz um. Meta-Groesse und kurzes „ggü. Vorjahr" halten die
 * Zeilen auf dem iPhone einzeilig; der volle Satz steht im Titel.
 */
function TrendCaption({
  comparison,
  hint,
}: {
  comparison: { value: string; caption: string; tone: ComparisonTone } | undefined;
  hint: string;
}) {
  if (!comparison) return null;
  return (
    <div className={cn("space-y-0.5", toneClass[comparison.tone])} title={hint}>
      {comparison.value !== NOT_AVAILABLE && <p>{comparison.value}</p>}
      <p>{comparison.caption}</p>
    </div>
  );
}

interface KpiCardsProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/** Vier primaere Kennzahlkarten (§5); die Historie steht in `HistoricalOverview`. */
export function KpiCards({ payments, selection, today }: KpiCardsProps) {
  const cards = React.useMemo(() => {
    const ref = today;
    const isAll = selection === "all";
    const isCurrentYear = selection === ref.year;

    // 5.1 Ausgewaehlter Zeitraum
    const selectedAgg = selectedPeriodAggregate(payments, selection);
    const { current, prior } = selectedYearComparison(payments, selection, ref);
    const selectedComparison = isAll
      ? undefined
      : splitComparison(comparePeriods(current, prior), "ggü. Vorjahr");
    const selectedComparisonHint = isCurrentYear
      ? "Gegenüber dem gleichen Zeitraum des Vorjahres"
      : "Gegenüber dem Vorjahr";

    // 5.2 Aktueller Monat (immer, unabhaengig von der Jahresauswahl)
    const monthAgg = currentMonthAggregate(payments, ref);
    const monthCompare = currentMonthComparison(payments, ref);
    const monthComparison = splitComparison(
      comparePeriods(monthCompare.current, monthCompare.prior),
      "ggü. Vorjahr",
    );

    // 5.5 Bester Monat
    const best = isAll
      ? bestMonthAllTime(payments)
      : bestMonthInYear(payments, selection);

    // 5.6 Aktivitaet im Zeitraum: Wie viele Zahlungen kamen herein — und aus
    // wie vielen Quellen? Die blosse Zahl ausschuettender Unternehmen sagte
    // nichts ueber das Jahr aus; die Anzahl der Eingaenge schon, und die
    // Breite steht als Zusatz daneben.
    const periodPayments = isAll
      ? payments
      : payments.filter((p) => yearOf(p.payDate) === selection);
    const companies = distinctSecurities(periodPayments);
    const depots = distinctDepots(periodPayments);

    return {
      isAll,
      isCurrentYear,
      showCurrentMonth: isAll || isCurrentYear,
      periodCount: periodPayments.length,
      selectedAgg,
      selectedComparison,
      selectedComparisonHint,
      monthAgg,
      monthComparison,
      best,
      companies,
      depots,
    };
  }, [payments, selection, today]);

  const selectionLabel = describeSelection(selection);
  const currentMonthLabel = formatMonthYear(today.year, today.month);
  const showAverage = !cards.isAll && typeof selection === "number";
  // Vier Kacheln, zwei Reihen: Wo die Monats- oder die Durchschnittskachel
  // entfaellt (anderes Jahr, „Alle Jahre"), fuellt die Zahl der Zahlungen den
  // Platz.
  const showPaymentsCard = !(cards.showCurrentMonth && showAverage);

  return (
    // Hoechstens vier primaere Kennzahlen (UX_AND_DESIGN_SYSTEM.md #2): Die
    // Gesamtsumme aller Jahre stand zuvor als fuenfte Kachel oben und ein
    // zweites Mal in der historischen Uebersicht am Seitenende. Sie gehoert
    // dorthin; oben zaehlt der gewaehlte Zeitraum.
    <StatGrid>
      {/* 5.1 Dividenden im ausgewaehlten Zeitraum */}
      <StatCard
        label={`Dividenden ${selectionLabel}`}
        value={<AmountText amount={cards.selectedAgg.net} />}
        caption={
          <TrendCaption
            comparison={cards.selectedComparison}
            hint={cards.selectedComparisonHint}
          />
        }
        to={paymentsListHref({ year: selection })}
        drillLabel={`Zahlungen ${selectionLabel} anzeigen`}
      />

      {/* 5.2 Aktueller Monat — nur, wenn er im gewaehlten Zeitraum liegt. In
          einem anderen Jahr stuende hier eine Zahl aus einem Zeitraum, den die
          Seite gerade gar nicht zeigt. */}
      {cards.showCurrentMonth && (
        <StatCard
          label={currentMonthLabel}
          value={<AmountText amount={cards.monthAgg.net} />}
          caption={
            <TrendCaption
              comparison={cards.monthComparison}
              hint={`Gegenüber dem gleichen Zeitraum des Vorjahresmonats (1. bis ${String(today.day)}.)`}
            />
          }
          to={paymentsListHref({ year: today.year, month: today.month })}
          drillLabel="Zahlungen des aktuellen Monats anzeigen"
        />
      )}

      {/* 5.5 Bester Monat */}
      <StatCard
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

      {/* 5.4 Durchschnitt pro Monat (nur Einzeljahr) */}
      {showAverage && (
        <StatCard
          label="Ø pro Monat"
          value={<AmountText amount={averagePerMonth(payments, selection, today)} />}
          // Kurz, damit der Zusatz in der halbbreiten Kachel einzeilig bleibt;
          // „Durchschnitt" steht schon in der Beschriftung.
          caption={cards.isCurrentYear ? "pro begonnenem Monat" : "über 12 Monate"}
        />
      )}

      {/* 5.6 Aktivitaet im Zeitraum */}
      {showPaymentsCard && (
        <StatCard
          label={`Zahlungen ${selectionLabel}`}
          value={formatCountNumber(cards.periodCount)}
          // Je eine Zeile: Mit „·" verbunden brach die Angabe in der
          // halbbreiten Kachel mitten im Satz um.
          caption={
            <>
              <p>{formatCountNoun(cards.companies, "Unternehmen", "Unternehmen")}</p>
              <p>{formatCountNoun(cards.depots, "Depot", "Depots")}</p>
            </>
          }
          to={paymentsListHref({ year: selection })}
          drillLabel={`Zahlungen ${selectionLabel} anzeigen`}
        />
      )}
    </StatGrid>
  );
}
