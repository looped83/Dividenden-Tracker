import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { cn } from "@/lib/utils/cn";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import type { Money } from "@/lib/money";
import {
  availableYears,
  compareMonths,
  compareRollingTwelveMonths,
  compareYears,
  filterPayments,
  monthNameDe,
  refDateFromDate,
  type ComparisonMonthSide,
  type MonthComparison,
  type PeriodComparison,
  type StatisticsFilter,
} from "@/lib/statistics";
import { useStatisticsContext } from "./context";
import type { EntityInfo } from "@/features/dashboard/format";
import {
  entityArchived,
  entityName,
  formatIsoDate,
  formatPayments,
  splitComparison,
  statisticsDrillHref,
} from "./format";
import {
  applyComparisonSelection,
  comparisonMonthOptions,
  comparisonYearOptions,
  parseComparisonSelection,
  type ComparisonMode,
} from "./comparisonParams";
import { ComparisonLineChart, type ComparisonPoint } from "./components/charts";
import { ChartRowHeader } from "@/components/charts/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
 * waere. Unternehmens- und Depotfilter wirken dagegen weiter.
 */
export function ComparisonTab() {
  const { allPayments, filter, securities } = useStatisticsContext();
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

  const monthOptions = React.useMemo(
    () => comparisonMonthOptions(selection.currentYear, today),
    [selection.currentYear, today],
  );

  const comparison = React.useMemo<PeriodComparison | MonthComparison>(() => {
    if (selection.mode === "rollierend")
      return compareRollingTwelveMonths(payments, today);
    if (selection.mode === "monate") {
      return compareMonths(
        payments,
        selection.currentYear,
        selection.referenceYear,
        selection.month,
        today,
      );
    }
    return compareYears(payments, selection.currentYear, selection.referenceYear, today);
  }, [
    payments,
    selection.mode,
    selection.currentYear,
    selection.referenceYear,
    selection.month,
    today,
  ]);

  const points = React.useMemo<ComparisonPoint[]>(
    () =>
      "months" in comparison
        ? comparison.months.map((month) => ({
            label: month.label,
            current: month.current.cumulative.toChartNumber(),
            reference: month.reference.cumulative.toChartNumber(),
            currentMoney: month.current.cumulative,
            referenceMoney: month.reference.cumulative,
          }))
        : [],
    [comparison],
  );

  const referenceCaption =
    selection.mode === "rollierend"
      ? "gegenüber den 12 Monaten davor"
      : `gegenüber ${comparison.reference.label}`;
  // Betrag als Kennzahl, Prozentzahl darunter: In der halbbreiten Kachel des
  // Telefons stehen sonst beide in einer Zeile und brechen am Mittelpunkt um.
  const change = splitComparison(comparison.change, referenceCaption);
  const changeTone =
    change.tone === "positive"
      ? "text-positive"
      : change.tone === "negative"
        ? "text-negative"
        : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Zeitraumvergleich</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zwei Spalten schon auf dem Telefon: „Jahr" und „verglichen mit"
              gehoeren zusammen — sie bilden den Satz, den die Seite beantwortet
              („2026 verglichen mit 2025"), und untereinander stand zwischen
              ihnen ein Feld Luft. Vergleichsart und Monat bestimmen, *was*
              verglichen wird, und behalten die volle Breite. */}
          <div
            className={cn(
              "grid grid-cols-2 gap-3 sm:gap-4",
              selection.mode === "monate" ? "sm:grid-cols-4" : "sm:grid-cols-3",
            )}
          >
            <label className="col-span-2 space-y-1.5 sm:col-span-1">
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
                <option value="monate">Monat gegen Monat</option>
                <option value="rollierend">Letzte 12 Monate</option>
              </Select>
            </label>

            {selection.mode === "monate" && (
              <label className="col-span-2 space-y-1.5 sm:col-span-1">
                <span className="text-sm font-medium">Monat</span>
                <Select
                  value={String(selection.month)}
                  onChange={(event) => {
                    setSelection({
                      ...selection,
                      month: Number.parseInt(event.target.value, 10),
                    });
                  }}
                >
                  {monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {monthNameDe(month)}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {selection.mode !== "rollierend" && (
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
                        // Im laufenden Jahr gibt es den gewaehlten Monat
                        // moeglicherweise noch nicht.
                        month: Math.min(
                          selection.month,
                          comparisonMonthOptions(currentYear, today).length,
                        ),
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

      {/* Vier Kacheln, zwei je Zeile: Die vierte ist keine Fuellung, sondern
          die Angabe, ohne die die drei anderen in die Irre fuehren koennen —
          bis wann gerechnet wurde. Laeuft einer der Zeitraeume noch, endet der
          Vergleich auf **beiden** Seiten am selben Kalendertag; eine Zahl, die
          „2026" heisst, aber nur bis August reicht, muss das sagen
          (PRODUCT_SPEC.md §5.5, DECISIONS.md D-7-1). Bisher stand es nur als
          Sternchen an einzelnen Monatswerten weiter unten. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={comparison.current.label}
          value={<AmountText amount={comparison.current.net} />}
          comparison={formatPayments(comparison.current.count)}
        />
        <StatCard
          label={comparison.reference.label}
          value={<AmountText amount={comparison.reference.net} />}
          comparison={formatPayments(comparison.reference.count)}
        />
        <StatCard
          label="Veränderung"
          value={<span className={changeTone}>{change.value}</span>}
          comparison={change.caption}
        />
        <StatCard
          label="Zeitausschnitt"
          value={
            <span className="text-base sm:text-xl">
              bis {formatIsoDate(comparison.cutoff)}
            </span>
          }
          // Einzeilig: In der halbbreiten Kachel des Telefons brach der
          // vollstaendige Satz auf drei Zeilen um und machte die Kachel hoeher
          // als ihre Nachbarn. Der Stichtag steht als Wert darueber, die Zeile
          // sagt nur noch, ob dafuer etwas abgeschnitten wurde.
          comparison={comparison.truncated ? "beide Seiten gekappt" : "volle Zeiträume"}
        />
      </div>

      {"months" in comparison ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Kumulierter Verlauf</CardTitle>
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
            <CardHeader>
              <CardTitle>Monat für Monat</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonBreakdown
                rows={monthRows(comparison, filter)}
                rowHeader="Monat"
                currentLabel={comparison.current.label}
                referenceLabel={comparison.reference.label}
                caption={`Netto-Dividenden je Monat: ${comparison.current.label} gegenüber ${comparison.reference.label}`}
                hasPartial={comparison.months.some(
                  (month) => !month.current.complete || !month.reference.complete,
                )}
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nach Unternehmen</CardTitle>
          </CardHeader>
          <CardContent>
            {comparison.securities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                In keinem der beiden Monate gab es Dividendeneingänge.
              </p>
            ) : (
              <ComparisonBreakdown
                rows={securityRows(comparison, filter, securities)}
                rowHeader="Unternehmen"
                currentLabel={comparison.current.label}
                referenceLabel={comparison.reference.label}
                caption={`Netto-Dividenden je Unternehmen: ${comparison.current.label} gegenüber ${comparison.reference.label}`}
                hasPartial={comparison.truncated}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Aufschluesselung — eine Darstellung fuer Monate und Unternehmen
// ============================================================================

/** Eine Seite einer Vergleichszeile. */
interface BreakdownValue {
  money: Money;
  /**
   * Drill-down-Ziel. Fehlt, wenn die Zahlungsliste die Zahl **nicht exakt**
   * wiedergeben kann — beim angeschnittenen Stichtagsmonat (DECISIONS.md D-7-2)
   * und bei einem Betrag von null, wo der Link in eine leere Liste fuehrte.
   */
  href?: string | undefined;
  /** Was das Ziel zeigt, fuer Hilfsmittel: „Zahlungen im März 2026 anzeigen". */
  linkLabel?: string | undefined;
  /** Am Stichtag angeschnitten — wird gekennzeichnet und nie verlinkt. */
  partial: boolean;
}

interface BreakdownRow {
  key: string;
  /** Zeilenkopf: Monatsname oder Unternehmensname. */
  label: string;
  /** Optionales Ziel des Zeilenkopfs (Unternehmensseite). */
  labelHref?: string | undefined;
  archived?: boolean;
  current: BreakdownValue;
  reference: BreakdownValue;
  difference: Money;
}

interface ComparisonBreakdownProps {
  rows: BreakdownRow[];
  /** Ueberschrift der ersten Spalte, z. B. „Monat". */
  rowHeader: string;
  currentLabel: string;
  referenceLabel: string;
  /** Beschriftung fuer Hilfsmittel (Tabellen-`caption`, Listenbeschriftung). */
  caption: string;
  /** Wahr, wenn irgendeine Zeile angeschnitten ist — dann erscheint die Fussnote. */
  hasPartial: boolean;
}

/**
 * Gegenueberstellung Zeile fuer Zeile — fuer Monate wie fuer Unternehmen
 * dieselbe Darstellung, weil es dieselbe Aussage ist: zwei Werte und ihre
 * Differenz.
 *
 * **Ab `md` eine Tabelle, darunter eine Liste.** Vier Spalten mit Beträgen und
 * Namen passen bei 390 px nicht nebeneinander; die Tabelle liesse sich dann nur
 * seitlich verschieben, und genau das soll auf dem Telefon nicht passieren.
 * Die Liste stellt dieselben Zahlen untereinander — je Zeile der Name mit der
 * Differenz, darunter beide Zeitraeume. Umgeschaltet wird ueber
 * {@link useMediaQuery}, nicht ueber CSS: Beide Baeume gleichzeitig im Dokument
 * zu halten hiesse, jede Zahl zweimal auszuliefern.
 */
function ComparisonBreakdown({
  rows,
  rowHeader,
  currentLabel,
  referenceLabel,
  caption,
  hasPartial,
}: ComparisonBreakdownProps) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

  return (
    <div className="space-y-3">
      {isWide ? (
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>{rowHeader}</TableHead>
              <TableHead className="whitespace-nowrap text-right">
                {currentLabel}
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                {referenceLabel}
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">Differenz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <ChartRowHeader>
                  <BreakdownLabel row={row} />
                </ChartRowHeader>
                <TableCell className="whitespace-nowrap text-right">
                  <BreakdownAmount value={row.current} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <BreakdownAmount value={row.reference} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <BreakdownDifference amount={row.difference} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label={caption}
        >
          {rows.map((row) => {
            // Ein Monat ohne Zahlungen auf beiden Seiten braucht keine drei
            // Zeilen mit Gedankenstrichen — er braucht einen Satz.
            const leer =
              !row.current.partial &&
              !row.reference.partial &&
              row.current.money.isZero() &&
              row.reference.money.isZero();
            return (
              <li key={row.key} className="space-y-1.5 p-3">
                {/* Zuerst Name und Differenz: Das ist die Aussage der Zeile. */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    <BreakdownLabel row={row} />
                  </span>
                  {leer ? (
                    <span className="text-sm text-muted-foreground">keine Zahlungen</span>
                  ) : (
                    <span className="whitespace-nowrap">
                      <BreakdownDifference amount={row.difference} />
                    </span>
                  )}
                </div>
                {!leer && (
                  <dl className="space-y-0.5 text-sm text-muted-foreground">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt>{currentLabel}</dt>
                      <dd className="whitespace-nowrap text-foreground">
                        <BreakdownAmount value={row.current} />
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt>{referenceLabel}</dt>
                      <dd className="whitespace-nowrap text-foreground">
                        <BreakdownAmount value={row.reference} />
                      </dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasPartial && (
        <p className="text-sm text-muted-foreground">
          <span aria-hidden>*</span> Angeschnittener Monat: nur bis zum Stichtag
          gerechnet.
        </p>
      )}
    </div>
  );
}

function BreakdownLabel({ row }: { row: BreakdownRow }) {
  return (
    <>
      {row.labelHref ? (
        <Link
          to={row.labelHref}
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.label}
        </Link>
      ) : (
        row.label
      )}
      {row.archived && (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (archiviert)
        </span>
      )}
    </>
  );
}

function BreakdownDifference({ amount }: { amount: Money }) {
  if (amount.isZero()) {
    return (
      <>
        <span aria-hidden className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">Kein Unterschied</span>
      </>
    );
  }
  return <AmountText amount={amount} showSign />;
}

function BreakdownAmount({ value }: { value: BreakdownValue }) {
  if (value.partial) {
    return (
      <span title="Angeschnittener Monat — bis zum Stichtag gerechnet">
        <AmountText amount={value.money} /> <span aria-hidden>*</span>
        <span className="sr-only">(nur bis zum Stichtag)</span>
      </span>
    );
  }

  if (!value.href) {
    if (value.money.isZero()) {
      return (
        <>
          <span aria-hidden className="text-muted-foreground">
            —
          </span>
          <span className="sr-only">Keine Zahlungen</span>
        </>
      );
    }
    return <AmountText amount={value.money} />;
  }

  return (
    <Link
      to={value.href}
      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AmountText amount={value.money} />
      {value.linkLabel !== undefined && (
        <span className="sr-only"> — {value.linkLabel}</span>
      )}
    </Link>
  );
}

/** Zeilen des Jahres-/Zwoelfmonatsvergleichs: ein Monat je Zeile. */
function monthRows(
  comparison: PeriodComparison,
  filter: StatisticsFilter,
): BreakdownRow[] {
  const side = (value: ComparisonMonthSide): BreakdownValue => ({
    money: value.net,
    partial: !value.complete,
    ...(value.complete && !value.net.isZero()
      ? {
          href: statisticsDrillHref(filter, { year: value.year, month: value.month }),
          linkLabel: `Zahlungen im ${monthNameDe(value.month)} ${String(value.year)} anzeigen`,
        }
      : {}),
  });

  return comparison.months.map((month) => ({
    key: `${String(month.current.year)}-${String(month.month)}`,
    label: monthNameDe(month.month),
    current: side(month.current),
    reference: side(month.reference),
    difference: month.current.net.subtract(month.reference.net),
  }));
}

/** Zeilen des Monatsvergleichs: ein Unternehmen je Zeile. */
function securityRows(
  comparison: MonthComparison,
  filter: StatisticsFilter,
  securities: Map<string, EntityInfo>,
): BreakdownRow[] {
  const { month } = comparison;
  const side = (money: Money, year: number, securityId: string): BreakdownValue => ({
    money,
    partial: comparison.truncated,
    ...(!comparison.truncated && !money.isZero()
      ? {
          href: statisticsDrillHref(filter, { year, month, securityId }),
          linkLabel: `Zahlungen im ${monthNameDe(month)} ${String(year)} anzeigen`,
        }
      : {}),
  });

  const currentYear = yearOfIso(comparison.current.range.start);
  const referenceYear = yearOfIso(comparison.reference.range.start);

  return comparison.securities.map((row) => ({
    key: row.securityId,
    label: entityName(securities, row.securityId),
    labelHref: `/depot/${row.securityId}`,
    archived: entityArchived(securities, row.securityId),
    current: side(row.current, currentYear, row.securityId),
    reference: side(row.reference, referenceYear, row.securityId),
    difference: row.difference,
  }));
}

/** Jahr aus einem ISO-Datum — die Bereichsgrenzen tragen es bereits. */
function yearOfIso(iso: string): number {
  return Number.parseInt(iso.slice(0, 4), 10);
}
