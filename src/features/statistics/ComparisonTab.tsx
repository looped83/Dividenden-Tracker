import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import {
  availableYears,
  compareRollingTwelveMonths,
  compareYears,
  filterPayments,
  monthNameDe,
  refDateFromDate,
  type ComparisonMonthSide,
  type PeriodComparison,
  type StatisticsFilter,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import {
  describeComparison,
  formatIsoDate,
  formatPayments,
  statisticsDrillHref,
} from "./format";
import {
  applyComparisonSelection,
  comparisonYearOptions,
  parseComparisonSelection,
  type ComparisonMode,
} from "./comparisonParams";
import { ComparisonLineChart, type ComparisonPoint } from "./components/charts";

/**
 * Zeitraumvergleich (Statistik §11).
 *
 * Die fachliche Regel liegt vollstaendig in `lib/statistics/comparison`: Laeuft
 * eines der Jahre noch, werden **beide** Seiten am selben Kalendertag gekappt.
 * Diese Seite stellt das Ergebnis dar und benennt die Kappung ausdruecklich —
 * eine Zahl, die „2026" heisst, aber nur bis Juli reicht, fuehrt sonst in die
 * Irre.
 *
 * Der Jahresfilter der Statistikleiste bleibt hier bewusst wirkungslos: Er
 * reduziert die Datenbasis auf ein Jahr, womit die Vergleichsseite immer leer
 * waere. Unternehmens-, Depot-, Quellen- und Artfilter wirken dagegen weiter.
 */
export function ComparisonTab() {
  const { allPayments, filter } = useStatisticsContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = React.useMemo(() => refDateFromDate(), []);

  // Alle Filter ausser dem Jahr — die beiden Jahre waehlt dieser Bereich selbst.
  const yearlessFilter = React.useMemo(() => ({ ...filter, year: null }), [filter]);
  const payments = React.useMemo(
    () => filterPayments(allPayments, yearlessFilter),
    [allPayments, yearlessFilter],
  );

  const yearOptions = React.useMemo(
    () => comparisonYearOptions(availableYears(payments), today),
    [payments, today],
  );
  const selection = parseComparisonSelection(searchParams, yearOptions, today);

  const setSelection = React.useCallback(
    (next: Parameters<typeof applyComparisonSelection>[1]) => {
      setSearchParams((prev) => applyComparisonSelection(prev, next), {
        replace: false,
      });
    },
    [setSearchParams],
  );

  const comparison = React.useMemo<PeriodComparison>(
    () =>
      selection.mode === "rollierend"
        ? compareRollingTwelveMonths(payments, today)
        : compareYears(payments, selection.currentYear, selection.referenceYear, today),
    [payments, selection.mode, selection.currentYear, selection.referenceYear, today],
  );

  const points = React.useMemo<ComparisonPoint[]>(
    () =>
      comparison.months.map((month) => ({
        label: month.label,
        current: month.current.cumulative.toChartNumber(),
        reference: month.reference.cumulative.toChartNumber(),
        currentMoney: month.current.cumulative,
        referenceMoney: month.reference.cumulative,
      })),
    [comparison],
  );

  // Ohne Kontextzusatz: Gegen wen verglichen wird, steht in der Zeile darunter
  // — in der Kennzahl selbst wuerde es nur umbrechen.
  const change = describeComparison(comparison.change, "");
  const referenceCaption =
    selection.mode === "rollierend"
      ? "gegenüber den 12 Monaten davor"
      : `gegenüber ${comparison.reference.label}`;
  const changeTone =
    change.tone === "positive"
      ? "text-positive"
      : change.tone === "negative"
        ? "text-negative"
        : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Zeitraumvergleich</CardTitle>
          <p className="text-sm text-muted-foreground">
            Zwei Zeiträume nebeneinander — immer über denselben Ausschnitt.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Vergleichsart</span>
              <Select
                value={selection.mode}
                onChange={(event) => {
                  setSelection({
                    ...selection,
                    mode: event.target.value as ComparisonMode,
                  });
                }}
              >
                <option value="jahre">Jahr gegen Jahr</option>
                <option value="rollierend">Letzte 12 Monate</option>
              </Select>
            </label>

            {selection.mode === "jahre" && (
              <>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Jahr</span>
                  <Select
                    value={String(selection.currentYear)}
                    onChange={(event) => {
                      const currentYear = Number.parseInt(event.target.value, 10);
                      setSelection({
                        ...selection,
                        currentYear,
                        // Beide Seiten auf dasselbe Jahr zu stellen ergaebe
                        // einen Vergleich mit sich selbst.
                        referenceYear:
                          selection.referenceYear === currentYear
                            ? currentYear - 1
                            : selection.referenceYear,
                      });
                    }}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium">verglichen mit</span>
                  <Select
                    value={String(selection.referenceYear)}
                    onChange={(event) => {
                      setSelection({
                        ...selection,
                        referenceYear: Number.parseInt(event.target.value, 10),
                      });
                    }}
                  >
                    {yearOptions
                      .filter((year) => year !== selection.currentYear)
                      .map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                  </Select>
                </label>
              </>
            )}
          </div>

          {comparison.truncated && (
            <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Ein laufendes Jahr ist beteiligt. Beide Seiten enden deshalb am{" "}
                <strong className="font-medium text-foreground">
                  {formatIsoDate(comparison.cutoff)}
                </strong>{" "}
                bzw. am selben Tag des Vergleichsjahres — sonst stünde ein angefangenes
                Jahr gegen ein volles.
              </span>
            </p>
          )}

          {filter.year !== null && (
            <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Der Jahresfilter ({filter.year}) wirkt in diesem Bereich nicht — die
                verglichenen Zeiträume werden hier gewählt. Alle übrigen Filter gelten
                weiterhin.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard
          label={comparison.current.label}
          value={<AmountText amount={comparison.current.net} />}
          comparison={`${formatPayments(comparison.current.count)} · ${describeRange(comparison, "current")}`}
        />
        <StatCard
          label={comparison.reference.label}
          value={<AmountText amount={comparison.reference.net} />}
          comparison={`${formatPayments(comparison.reference.count)} · ${describeRange(comparison, "reference")}`}
        />
        <StatCard
          label="Veränderung"
          value={<span className={changeTone}>{change.text.trim()}</span>}
          comparison={`${referenceCaption} · ${
            comparison.truncated
              ? "gleicher Ausschnitt auf beiden Seiten"
              : "vollständige Zeiträume"
          }`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Kumulierter Verlauf</CardTitle>
          <p className="text-sm text-muted-foreground">
            Aufsummiert vom Beginn des Zeitraums. Der Abstand der Linien ist der Vorsprung
            bzw. Rückstand zum jeweiligen Zeitpunkt.
          </p>
        </CardHeader>
        <CardContent>
          <ComparisonLineChart
            points={points}
            currentLabel={comparison.current.label}
            referenceLabel={comparison.reference.label}
            ariaLabel={`Kumulierte Netto-Dividenden: ${comparison.current.label} gegenüber ${comparison.reference.label}`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Monat für Monat</CardTitle>
          <p className="text-sm text-muted-foreground">
            Einzelne Monate, nicht aufsummiert. Ein Betrag öffnet die zugehörigen
            Dividendeneingänge.
          </p>
        </CardHeader>
        <CardContent>
          <MonthlyComparisonTable comparison={comparison} filter={filter} />
        </CardContent>
      </Card>
    </div>
  );
}

/** „01.01.2026 – 29.07.2026". */
function describeRange(
  comparison: PeriodComparison,
  side: "current" | "reference",
): string {
  const { range } = comparison[side];
  return `${formatIsoDate(range.start)} – ${formatIsoDate(range.end)}`;
}

interface MonthlyComparisonTableProps {
  comparison: PeriodComparison;
  filter: StatisticsFilter;
}

/**
 * Monatsgegenueberstellung.
 *
 * Verlinkt wird nur, was die Zahlungsliste exakt wiedergeben kann: Sie filtert
 * auf Jahr und Monat, nicht auf einen Tag. Der am Stichtag angeschnittene Monat
 * bleibt deshalb unverlinkt — ein Link, der mehr zeigt als die Zahl daneben,
 * beschaedigt das Vertrauen in beide.
 */
function MonthlyComparisonTable({ comparison, filter }: MonthlyComparisonTableProps) {
  const { current, reference } = comparison;
  const hasPartialMonth = comparison.months.some(
    (month) => !month.current.complete || !month.reference.complete,
  );

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">
            Netto-Dividenden je Monat: {current.label} gegenüber {reference.label}
          </caption>
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th scope="col" className="px-2 py-3 text-left font-medium sm:px-4">
                Monat
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">
                {current.label}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">
                {reference.label}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">
                Differenz
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {comparison.months.map((month) => {
              const difference = month.current.net.subtract(month.reference.net);
              return (
                <tr
                  key={`${String(month.current.year)}-${String(month.month)}`}
                  className="border-b border-border"
                >
                  <th scope="row" className="px-2 py-3 text-left font-medium sm:px-4">
                    {monthNameDe(month.month)}
                  </th>
                  <MonthCell side={month.current} filter={filter} />
                  <MonthCell side={month.reference} filter={filter} />
                  <td className="whitespace-nowrap px-2 py-3 text-right sm:px-4">
                    {difference.isZero() ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <AmountText amount={difference} showSign />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasPartialMonth && (
        <p className="text-sm text-muted-foreground">
          <span aria-hidden>*</span> Angeschnittener Monat: nur bis zum Stichtag
          gerechnet. Diese Beträge führen nicht in die Zahlungsliste, weil sie dort nur
          als ganzer Monat darstellbar wären.
        </p>
      )}
    </div>
  );
}

function MonthCell({
  side,
  filter,
}: {
  side: ComparisonMonthSide;
  filter: StatisticsFilter;
}) {
  const amount = <AmountText amount={side.net} />;

  if (!side.complete) {
    return (
      <td className="whitespace-nowrap px-2 py-3 text-right sm:px-4">
        <span title="Angeschnittener Monat — bis zum Stichtag gerechnet">
          {amount} <span aria-hidden>*</span>
          <span className="sr-only">(nur bis zum Stichtag)</span>
        </span>
      </td>
    );
  }

  if (side.net.isZero()) {
    return (
      <td className="whitespace-nowrap px-2 py-3 text-right text-muted-foreground sm:px-4">
        <span aria-hidden>—</span>
        <span className="sr-only">Keine Zahlungen</span>
      </td>
    );
  }

  return (
    <td className="whitespace-nowrap px-2 py-3 text-right sm:px-4">
      <Link
        to={statisticsDrillHref(filter, { year: side.year, month: side.month })}
        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {amount}
        <span className="sr-only">
          {" "}
          — Zahlungen im {monthNameDe(side.month)} {side.year} anzeigen
        </span>
      </Link>
    </td>
  );
}
