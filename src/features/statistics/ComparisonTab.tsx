import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Info } from "lucide-react";
import { ListGroup, ListTile } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import type { Money } from "@/lib/money";
import {
  availableYears,
  compareMonths,
  compareRollingTwelveMonths,
  compareYears,
  filterPayments,
  monthNameDe,
  monthNameDeShort,
  type ComparisonMonthSide,
  type MonthComparison,
  type PeriodComparison,
  type StatisticsFilter,
} from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { useStatisticsContext } from "./context";
import type { EntityInfo } from "@/features/dashboard/format";
import {
  entityArchived,
  entityName,
  formatPayments,
  splitComparison,
  statisticsDrillHref,
  withoutSign,
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
  const today = useToday();

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
    <div className="space-y-10">
      {/* Die Wahl der Zeitraeume ohne Kartenrahmen, die Felder als Pillen
          wie die Filterleiste darueber (seit 1.9.0): Sie ist das Werkzeug der
          Seite, kein eigener Abschnitt. */}
      <section aria-labelledby="comparison-setup" className="space-y-3">
        <h2 id="comparison-setup" className="sr-only">
          Zeitraumvergleich
        </h2>
        {/* Die Wahl der Zeitraeume als Zeile aus Pillen wie die Filterleiste:
            Sie liest sich als Satz („Jahr gegen Jahr · 2026 · gegen 2025"),
            die Beschriftungen bleiben fuer Hilfsmittel. Auf dem Telefon stehen
            Jahr und Vergleichsjahr nebeneinander — sie gehoeren zusammen —,
            Vergleichsart und Monat in voller Breite. */}
        <FilterBar>
          <label className="min-w-0 flex-1 basis-full sm:max-w-72 sm:basis-40">
            <span className="sr-only">Vergleichsart</span>
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
            <label className="min-w-0 flex-1 basis-full sm:max-w-72 sm:basis-40">
              <span className="sr-only">Monat</span>
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
              <label className="min-w-0 flex-1 basis-[calc(50%-0.375rem)] sm:max-w-72 sm:basis-40">
                <span className="sr-only">Jahr</span>
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

              <label className="min-w-0 flex-1 basis-[calc(50%-0.375rem)] sm:max-w-72 sm:basis-40">
                <span className="sr-only">verglichen mit</span>
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
                        gegen {year}
                      </option>
                    ))}
                </Select>
              </label>
            </>
          )}
        </FilterBar>

        {/* Bis wann gerechnet wurde — ohne diese Angabe fuehren die Kacheln
              darunter in die Irre: Laeuft einer der Zeitraeume noch, endet der
              Vergleich auf **beiden** Seiten am selben Kalendertag (PRODUCT_SPEC.md
              §5.5, DECISIONS.md D-7-1). Eine eigene Kachel dafuer kostete auf
              dem Telefon eine halbe Reihe; als Satz unter der Auswahl steht
              sie dort, wo der Zeitraum gewaehlt wird. */}
        <p className="text-sm text-muted-foreground">
          {comparison.truncated
            ? `Gerechnet bis ${formatCalendarDate(comparison.cutoff)} — beide Seiten am selben Kalendertag gekappt.`
            : `Volle Zeiträume, gerechnet bis ${formatCalendarDate(comparison.cutoff)}.`}
        </p>

        {filter.year !== null && (
          <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Der Jahresfilter ({filter.year}) wirkt in diesem Bereich nicht — die
              verglichenen Zeiträume werden hier gewählt. Alle übrigen Filter gelten
              weiterhin.
            </span>
          </p>
        )}
      </section>

      {/* Die Aussage des Vergleichs — die Veraenderung — ist die Hauptzahl;
          beide Zeitraeume stehen darunter. Als drei gleich grosse Kacheln
          stand sie zuletzt und allein in einer eigenen Reihe. */}
      <KpiHero
        label="Veränderung"
        value={
          <span className={cn("inline-flex items-baseline gap-2", changeTone)}>
            {change.tone !== "neutral" && (
              <TrendTriangle
                direction={change.tone === "negative" ? "down" : "up"}
                announce
                className="size-[0.4em]"
              />
            )}
            {change.tone === "neutral" ? change.value : withoutSign(change.value)}
          </span>
        }
        caption={change.caption}
        stats={[
          {
            label: comparison.current.label,
            value: <AmountText amount={comparison.current.net} />,
            caption: formatPayments(comparison.current.count),
          },
          {
            label: comparison.reference.label,
            value: <AmountText amount={comparison.reference.net} />,
            caption: formatPayments(comparison.reference.count),
          },
        ]}
      />

      {"months" in comparison ? (
        <>
          <Section title="Kumulierter Verlauf">
            <div>
              <ComparisonLineChart
                points={points}
                currentLabel={comparison.current.label}
                referenceLabel={comparison.reference.label}
                ariaLabel={`Kumulierte Netto-Dividenden: ${comparison.current.label} gegenüber ${comparison.reference.label}`}
              />
            </div>
          </Section>

          <Section title="Monat für Monat">
            <div>
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
            </div>
          </Section>
        </>
      ) : (
        <Section title="Nach Assets">
          <div>
            {comparison.securities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                In keinem der beiden Monate gab es Dividenden.
              </p>
            ) : (
              <ComparisonBreakdown
                rows={securityRows(comparison, filter, securities)}
                rowHeader="Asset"
                currentLabel={comparison.current.label}
                referenceLabel={comparison.reference.label}
                caption={`Netto-Dividenden je Asset: ${comparison.current.label} gegenüber ${comparison.reference.label}`}
                hasPartial={comparison.truncated}
              />
            )}
          </div>
        </Section>
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
  /**
   * Kurzname für die Kachel am Zeilenanfang der Liste („Mär") — Monate stehen
   * dort wie das Datum bei den Eingängen. Ohne Kachel steht `label` als Titel.
   */
  tile?: string;
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
        <ListGroup aria-label={caption}>
          {rows.map((row) => {
            // Ein Monat ohne Zahlungen auf beiden Seiten braucht keine drei
            // Zeilen mit Gedankenstrichen — er braucht einen Satz.
            const leer =
              !row.current.partial &&
              !row.reference.partial &&
              row.current.money.isZero() &&
              row.reference.money.isZero();
            if (row.tile !== undefined) {
              // Monat als Kachel vorn, daneben beide Zeiträume untereinander,
              // die Differenz rechts. Der volle Monatsname steht für
              // Sprachausgaben in der Zeile, die Kachel ist dekorativ.
              return (
                <li key={row.key} className="flex items-center gap-3 px-3 py-2">
                  <ListTile primary={row.tile} />
                  <span className="sr-only">{row.label}</span>
                  {leer ? (
                    <span className="text-sm text-muted-foreground">
                      keine Dividenden
                    </span>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1 space-y-0.5 tabular-amount">
                        <p className="truncate">
                          <span className="text-muted-foreground">{currentLabel}</span>{" "}
                          <span className="font-medium">
                            <BreakdownAmount value={row.current} />
                          </span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {referenceLabel}{" "}
                          <span className="text-foreground">
                            <BreakdownAmount value={row.reference} />
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap font-medium">
                        <BreakdownDifference amount={row.difference} />
                      </span>
                    </>
                  )}
                </li>
              );
            }
            return (
              // Zwei Zeilen: Name und Differenz, darunter beide Zeitraeume in
              // einer Zeile. Untereinander beschriftet brauchte jeder Monat
              // drei Zeilen, ein Jahresvergleich gut einen Bildschirm mehr.
              <li key={row.key} className="space-y-0.5 px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    <BreakdownLabel row={row} />
                  </span>
                  {leer ? (
                    <span className="text-sm text-muted-foreground">
                      keine Dividenden
                    </span>
                  ) : (
                    <span className="whitespace-nowrap font-medium">
                      <BreakdownDifference amount={row.difference} />
                    </span>
                  )}
                </div>
                {!leer && (
                  <p className="flex gap-3 text-xs text-muted-foreground tabular-amount">
                    <span>
                      {currentLabel}{" "}
                      <span className="text-foreground">
                        <BreakdownAmount value={row.current} />
                      </span>
                    </span>
                    <span>
                      {referenceLabel}{" "}
                      <span className="text-foreground">
                        <BreakdownAmount value={row.reference} />
                      </span>
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ListGroup>
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
          <span className="sr-only">Keine Dividenden</span>
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
          linkLabel: `Dividenden im ${monthNameDe(value.month)} ${String(value.year)} anzeigen`,
        }
      : {}),
  });

  return comparison.months.map((month) => ({
    key: `${String(month.current.year)}-${String(month.month)}`,
    label: monthNameDe(month.month),
    tile: monthNameDeShort(month.month),
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
          linkLabel: `Dividenden im ${monthNameDe(month)} ${String(year)} anzeigen`,
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
