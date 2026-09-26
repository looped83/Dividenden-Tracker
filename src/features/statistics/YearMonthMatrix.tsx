import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { AmountText } from "@/components/money/AmountText";
import { cn } from "@/lib/utils/cn";
import {
  currencySymbol,
  formatAmount,
  formatMoney,
  formatPercent,
  type Money,
} from "@/lib/money";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  breakdownMatrix,
  filterPayments,
  monthNameDe,
  monthNameDeShort,
  refDateFromDate,
  type BreakdownCell,
  type BreakdownMatrix,
  type ComparisonResult,
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
  applyBreakdownView,
  BREAKDOWN_VIEW_LABELS,
  parseBreakdownView,
  type BreakdownView,
} from "./breakdownParams";

/**
 * Jahre × Monate (Statistik §11.12): alle Jahre und Monate in **einer**
 * Tabelle — Teil der Uebersicht.
 *
 * Hier sind zwei fruehere Darstellungen derselben Frage zusammengefuehrt: die
 * Heatmap der Uebersicht (Farbe je Monat, ohne Zahl) und der eigene Reiter
 * „Breakdown" (Zahl je Monat, ohne Farbe). In der Ansicht „Summe je Monat"
 * tragen die Zellen jetzt beides — den Betrag und eine Toenung nach seiner
 * Hoehe. Jede Zahl fuehrt in die Zahlungsliste dahinter (§11.9).
 *
 * Die Rechnung liegt vollstaendig in `lib/statistics/breakdown`; diese Kachel
 * stellt dar und benennt, was die Zahlen einschraenkt: das laufende Jahr und
 * den laufenden Monat.
 *
 * Der Jahresfilter der Statistikleiste bleibt hier wirkungslos — er reduzierte
 * die Matrix auf eine einzige Zeile. Die Kennzahlen darueber folgen ihm; alle
 * uebrigen Filter wirken auch hier.
 */
export function YearMonthMatrix() {
  const { allPayments, filter } = useStatisticsContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const today = React.useMemo(() => refDateFromDate(), []);
  const view = parseBreakdownView(searchParams);

  const yearlessFilter = React.useMemo(() => ({ ...filter, year: null }), [filter]);
  const payments = React.useMemo(
    () => filterPayments(allPayments, yearlessFilter),
    [allPayments, yearlessFilter],
  );
  const matrix = React.useMemo(() => breakdownMatrix(payments, today), [payments, today]);

  const setView = (next: BreakdownView) => {
    setSearchParams((prev) => applyBreakdownView(prev, next), { replace: true });
  };

  const runningYear = matrix.years.find((row) => row.running);

  if (matrix.years.length === 0) return null;

  return (
    <Card>
      {/* Die Ansichtswahl steht in der Kopfzeile rechts: Sie gehoert zur
          Kachel, nicht zu ihrem Inhalt, und braucht dort keine eigene
          Beschriftung — die Auswahl benennt sich selbst („Summe je Monat").
          Fuer Hilfsmittel traegt sie den Namen als `aria-label`. */}
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Jahre × Monate</CardTitle>
        <div className="sm:-my-3 sm:w-56 sm:shrink-0">
          <Select
            aria-label="Ansicht"
            value={view}
            onChange={(event) => {
              setView(event.target.value as BreakdownView);
            }}
          >
            {(Object.keys(BREAKDOWN_VIEW_LABELS) as BreakdownView[]).map((value) => (
              <option key={value} value={value}>
                {BREAKDOWN_VIEW_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filter.year !== null && (
          <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Der Jahresfilter ({filter.year}) wirkt in dieser Tabelle nicht — sie stellt
              alle Jahre gegenüber. Alle übrigen Filter gelten weiterhin.
            </span>
          </p>
        )}

        {isWide ? (
          <BreakdownMatrixTable matrix={matrix} view={view} filter={filter} />
        ) : (
          <TransposedMatrixTable matrix={matrix} view={view} filter={filter} />
        )}

        {/* Einziger Hinweis unter der Tabelle: das Sternchen am laufenden
            Jahr. Alles Weitere steht dort, wo es gebraucht wird — als Titel
            und Screenreader-Text an der jeweiligen Zelle. */}
        {(runningYear !== undefined || !isWide) && (
          <p className="text-sm text-muted-foreground">
            {!isWide && `Beträge in ${currencySymbol(matrix.totals.net.currency)}. `}
            {runningYear && (
              <>
                <span aria-hidden>* </span>
                {`${String(runningYear.year)} läuft noch — gerechnet bis ${formatIsoDate(
                  matrix.cutoff,
                )}.`}
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Toenung einer Zelle nach der Hoehe ihres Betrags — die fruehere Heatmap.
 * Wurzelskaliert, damit auch kleine Monate sichtbar bleiben; hoechstens 40 %
 * Deckkraft, damit die Zahl darauf in beiden Erscheinungsbildern lesbar bleibt.
 * Nur in der Ansicht „Summe": Veraenderung und Aufgelaufenes haben eine eigene
 * Skala, die eine gemeinsame Farbe verfaelschen wuerde.
 */
function useCellTint(matrix: BreakdownMatrix, view: BreakdownView) {
  const max = React.useMemo(() => {
    let value = 0;
    for (const row of matrix.years) {
      for (const cell of row.cells) value = Math.max(value, cell.net.toChartNumber());
    }
    return value;
  }, [matrix]);

  return (cell: BreakdownCell): React.CSSProperties | undefined => {
    if (view !== "summe" || cell.future || max <= 0) return undefined;
    const value = cell.net.toChartNumber();
    if (value <= 0) return undefined;
    const alpha = Math.round(Math.min(1, Math.sqrt(value / max)) * 40);
    return {
      backgroundColor: `color-mix(in srgb, var(--chart-1) ${String(alpha)}%, transparent)`,
    };
  };
}

// ============================================================================
// Matrix
// ============================================================================

const CAPTIONS: Readonly<Record<BreakdownView, string>> = {
  summe: "Netto-Dividenden je Monat und Jahr",
  veraenderung: "Veränderung der Netto-Dividenden je Monat gegenüber dem Vorjahresmonat",
  kumuliert: "Aufgelaufene Netto-Dividenden im Jahresverlauf",
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

interface MatrixProps {
  matrix: BreakdownMatrix;
  view: BreakdownView;
  filter: StatisticsFilter;
}

/**
 * Die Matrix selbst.
 *
 * **Jahre als Zeilen, Monate als Spalten.** Die Breite steht damit fest: zwoelf
 * Monate plus zwei Randspalten, heute wie in zehn Jahren. Waeren die Jahre die
 * Spalten, wuechse die Tabelle mit jedem Jahreswechsel weiter nach rechts.
 *
 * **Waagerecht verschiebbar statt umgebrochen.** Eine Matrix laesst sich nicht
 * in Karten aufloesen, ohne genau das zu verlieren, wofuer sie da ist: den
 * Vergleich nebeneinander. Die Monate verschieben sich deshalb zwischen zwei
 * festen Spalten: das Jahr links, die Jahressumme rechts (`sticky`). So behaelt
 * jede Zahl ihre Zeile, und der Wert, auf den die Zeile hinauslaeuft, bleibt
 * sichtbar. Auf dem Telefon steht nur die Jahresspalte fest — zwei feste
 * Spalten liessen von zwoelf Monaten kaum einen uebrig.
 *
 * `border-separate` statt `border-collapse`: Zusammengefasste Rahmen
 * verschwinden in mehreren Browsern unter `position: sticky`. Die Linien liegen
 * deshalb an den Zellen.
 *
 * **Alle zwoelf Monatsspalten sind gleich breit.** Mit der automatischen
 * Breitenverteilung richtet sich jede Spalte nach ihrem Inhalt: Filtert man auf
 * ein Unternehmen, das im Maerz und im Juni zahlt, stehen zwei 130px breite
 * Spalten zwischen zehn 55px schmalen — die Monatsnamen sitzen dann an voellig
 * verschiedenen Stellen, und die Tabelle wirkt zerrissen. Die Breite wird
 * deshalb einmal aus dem laengsten Zahlenwert berechnet und fuer alle Monate
 * gesetzt (`table-fixed`). In `ch` gerechnet, weil alle Zahlen in
 * Tabellenziffern stehen — dort ist ein Zeichen so breit wie jedes andere.
 */
function BreakdownMatrixTable({ matrix, view, filter }: MatrixProps) {
  const tintOf = useCellTint(matrix, view);
  // Der laengste Betrag bestimmt die Spaltenbreite. Die Prozentwerte der
  // Ansicht „Veraenderung" sind stets kuerzer, die Monatssummen der Fusszeile
  // die groessten Zahlen der Tabelle — beides ist damit abgedeckt. Drei Zeichen
  // Zugabe tragen den Innenabstand der Zelle.
  const { monthWidth, totalWidth } = React.useMemo(() => {
    let month = 4;
    let total = 4;
    for (const row of matrix.years) {
      for (const cell of row.cells) {
        month = Math.max(
          month,
          formatMoney(cell.net).length,
          formatMoney(cell.cumulative).length,
        );
      }
      total = Math.max(total, formatMoney(row.net).length);
    }
    for (const column of matrix.months) {
      month = Math.max(month, formatMoney(column.net).length);
    }
    total = Math.max(total, formatMoney(matrix.totals.net).length);
    return {
      monthWidth: `${String(month + 3)}ch`,
      totalWidth: `${String(total + 4)}ch`,
    };
  }, [matrix]);

  const caption = `${CAPTIONS[view]}, Zeilen je Jahr, Spalten je Monat`;

  return (
    // `relative` ist hier keine Kosmetik: Die Beschriftungen fuer Hilfsmittel
    // (`sr-only`) sind absolut positioniert. Ohne positionierten Vorfahren ist
    // ihr Bezugsrahmen das Dokument — der seitliche Bildlauf dieses Kastens
    // klammert sie dann nicht ein, und die Seite selbst laesst sich bis zur
    // rechten Tabellenkante schieben, obwohl dort nichts Sichtbares steht.
    <div className="relative w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-20" />
          {matrix.months.map((month) => (
            <col key={month.month} style={{ width: monthWidth }} />
          ))}
          <col style={{ width: totalWidth }} />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Jahr
            </th>
            {matrix.months.map((month) => (
              <th
                key={month.month}
                scope="col"
                className="whitespace-nowrap border-b border-border bg-muted px-2.5 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                <span aria-hidden>{monthNameDeShort(month.month)}</span>
                <span className="sr-only">{monthNameDe(month.month)}</span>
              </th>
            ))}
            <th
              scope="col"
              className="z-20 whitespace-nowrap border-b border-l border-border bg-muted px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground sm:sticky sm:right-0"
            >
              Gesamt
            </th>
          </tr>
        </thead>

        <tbody>
          {matrix.years.map((row) => (
            <tr key={row.year}>
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-card px-3 py-2 text-left font-medium tabular-nums"
              >
                {row.year}
                {row.running && (
                  <>
                    <span aria-hidden>*</span>
                    <span className="sr-only"> (laufendes Jahr)</span>
                  </>
                )}
              </th>
              {row.cells.map((cell) => (
                <td
                  key={cell.month}
                  className={cn(
                    "whitespace-nowrap border-b border-border px-2.5 py-2 text-right tabular-nums",
                    cell.future && "bg-muted/40",
                  )}
                  style={tintOf(cell)}
                >
                  <MatrixCell cell={cell} view={view} filter={filter} />
                </td>
              ))}
              {/* Jahressumme und Vorjahresvergleich stehen zusammen in **einer**
                  Spalte: Beide sagen etwas ueber dasselbe Jahr, und eine Spalte
                  weniger heisst eine Spalte mehr Platz fuer die Monate. */}
              <td
                className="z-10 whitespace-nowrap border-b border-l border-border bg-card px-3 py-2 text-right font-medium tabular-nums sm:sticky sm:right-0"
                title={`${String(row.year)}: ${formatMoney(row.net)} · ${formatPayments(
                  row.count,
                )} · Zahlungen in ${String(row.activeMonths)} von 12 Monaten`}
              >
                <AmountText amount={row.net} />
                <span className="block text-xs font-normal">
                  <ChangeValue change={row.change} context="ggü. Vorjahr" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 whitespace-nowrap border-r border-t border-border bg-muted px-3 py-2 text-left font-medium"
            >
              Gesamt
            </th>
            {matrix.months.map((month) => (
              <td
                key={month.month}
                className="whitespace-nowrap border-t border-border bg-muted px-2.5 py-2 text-right font-medium tabular-nums"
                title={`${monthNameDe(month.month)} über alle Jahre: ${formatMoney(
                  month.net,
                )} · ${formatPayments(month.count)}`}
              >
                {month.count === 0 ? (
                  <Dash label={`${monthNameDe(month.month)}: keine Zahlungen`} />
                ) : (
                  <AmountText amount={month.net} />
                )}
              </td>
            ))}
            <td
              className="z-10 whitespace-nowrap border-l border-t border-border bg-muted px-3 py-2 text-right font-semibold tabular-nums sm:sticky sm:right-0"
              title={formatPayments(matrix.totals.count)}
            >
              <AmountText amount={matrix.totals.net} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Die Matrix auf dem Telefon — **gedreht**: Monate als Zeilen, Jahre als
 * Spalten, das juengste Jahr vorn. Zwoelf Monatsspalten passten auf 390px
 * nicht nebeneinander; sichtbar waren Januar und Februar, der Rest lag hinter
 * einem seitlichen Bildlauf. Jahre gibt es wenige, und die juengsten sind die
 * gefragten — aeltere erreicht ein Bildlauf, die Monatsspalte bleibt stehen.
 *
 * Die Betraege stehen ohne Waehrungszeichen; die Waehrung nennt der Satz
 * unter der Tabelle (wie an den Diagrammachsen, UX_AND_DESIGN_SYSTEM.md §3).
 * Mit „€" in jeder Zelle passten vier Jahre nicht nebeneinander. Die
 * Monatssummen ueber alle Jahre entfallen hier; sie zeigt „Verlauf" nach
 * Monaten.
 */
function TransposedMatrixTable({ matrix, view, filter }: MatrixProps) {
  const tintOf = useCellTint(matrix, view);

  return (
    <div className="relative w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <caption className="sr-only">{`${CAPTIONS[view]}, Zeilen je Monat, Spalten je Jahr`}</caption>
        <thead>
          <tr>
            {/* Die Monatsspalte ist so schmal wie „Mär": Ihr Kopf steht nur fuer
                Hilfsmittel da, die Summenzeile heisst sichtbar „Σ". Jeder
                Pixel hier ist einer mehr fuer die Jahre. */}
            <th
              scope="col"
              className="sticky left-0 z-20 border-b border-r border-border bg-muted px-2 py-2"
            >
              <span className="sr-only">Monat</span>
            </th>
            {matrix.years.map((row) => (
              <th
                key={row.year}
                scope="col"
                className="whitespace-nowrap border-b border-border bg-muted px-1.5 py-2 text-right font-medium tabular-nums text-muted-foreground"
              >
                {row.year}
                {row.running && (
                  <>
                    <span aria-hidden>*</span>
                    <span className="sr-only"> (laufendes Jahr)</span>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONTHS.map((month) => (
            <tr key={month}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-2.5 text-left font-medium"
              >
                <span aria-hidden>{monthNameDeShort(month)}</span>
                <span className="sr-only">{monthNameDe(month)}</span>
              </th>
              {matrix.years.map((row) => {
                // Genau zwoelf Zellen je Jahr, Januar bis Dezember.
                const cell = row.cells[month - 1];
                return (
                  <td
                    key={row.year}
                    className={cn(
                      "whitespace-nowrap border-b border-border px-1.5 py-2.5 text-right tabular-nums",
                      cell.future && "bg-muted/40",
                    )}
                    style={tintOf(cell)}
                  >
                    <MatrixCell cell={cell} view={view} filter={filter} compact />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              title="Gesamt"
              className="sticky left-0 z-10 border-r border-t border-border bg-muted px-2 py-2 text-left font-medium"
            >
              <span aria-hidden>Σ</span>
              <span className="sr-only">Gesamt</span>
            </th>
            {matrix.years.map((row) => (
              <td
                key={row.year}
                className="whitespace-nowrap border-t border-border bg-muted px-1.5 py-2 text-right font-medium tabular-nums"
                title={`${String(row.year)}: ${formatMoney(row.net)} · ${formatPayments(row.count)}`}
              >
                <span aria-hidden>{formatAmount(row.net)}</span>
                <span className="sr-only">{formatMoney(row.net)}</span>
                <span className="block font-normal">
                  <ChangeValue change={row.change} context="ggü. Vorjahr" />
                </span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Ein Betrag in der Matrix. `compact` laesst das Waehrungszeichen weg (Telefon,
 * siehe {@link TransposedMatrixTable}); vorgelesen wird der volle Betrag.
 */
function MatrixAmount({ amount, compact }: { amount: Money; compact: boolean }) {
  if (!compact) return <AmountText amount={amount} />;
  return (
    <>
      <span aria-hidden className={cn(amount.isNegative() && "text-negative")}>
        {formatAmount(amount)}
      </span>
      <span className="sr-only">{formatMoney(amount)}</span>
    </>
  );
}

/** Zellinhalt je Ansicht. */
function MatrixCell({
  cell,
  view,
  filter,
  compact = false,
}: {
  cell: BreakdownCell;
  view: BreakdownView;
  filter: StatisticsFilter;
  compact?: boolean;
}) {
  const period = `${monthNameDe(cell.month)} ${String(cell.year)}`;

  if (cell.future) {
    return <span className="sr-only">{period}: noch nicht erreicht</span>;
  }

  if (view === "veraenderung") {
    return (
      <ChangeValue
        change={cell.change}
        context={`ggü. ${monthNameDe(cell.month)} ${String(cell.year - 1)}`}
      />
    );
  }

  if (view === "kumuliert") {
    return cell.cumulative.isZero() ? (
      <Dash label={`${period}: noch nichts aufgelaufen`} />
    ) : (
      <span title={`${period}: ${formatMoney(cell.cumulative)} seit Jahresbeginn`}>
        <MatrixAmount amount={cell.cumulative} compact={compact} />
        {cell.partial && <span aria-hidden>*</span>}
      </span>
    );
  }

  if (cell.count === 0) return <Dash label={`${period}: keine Zahlungen`} />;

  return (
    <Link
      to={statisticsDrillHref(filter, { year: cell.year, month: cell.month })}
      title={`${period}: ${formatMoney(cell.net)} · ${formatPayments(cell.count)}`}
      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MatrixAmount amount={cell.net} compact={compact} />
      {cell.partial && <span aria-hidden>*</span>}
      <span className="sr-only">
        {" "}
        — {period}, {formatPayments(cell.count)}
        {cell.partial ? ", Monat läuft noch" : ""}, Zahlungen anzeigen
      </span>
    </Link>
  );
}

/**
 * Veraenderung als kurze Zahl. In einer Matrix ist kein Platz fuer den Satz,
 * den die Karten zeigen — der volle Wortlaut steht deshalb als Titel und fuer
 * Hilfsmittel daneben.
 */
function ChangeValue({ change, context }: { change: ComparisonResult; context: string }) {
  const described = describeComparison(change, context);
  const tone =
    described.tone === "positive"
      ? "text-positive"
      : described.tone === "negative"
        ? "text-negative"
        : "text-muted-foreground";

  if (change.kind === "percent") {
    const sign = !change.percent.isNegative() && !change.percent.isZero() ? "+" : "";
    return (
      <span className={tone} title={described.text}>
        <span aria-hidden>{`${sign}${formatPercent(change.percent)}`}</span>
        <span className="sr-only">{described.text}</span>
      </span>
    );
  }

  if (change.kind === "new") {
    return (
      <span className={tone} title={described.text}>
        <span aria-hidden>neu</span>
        <span className="sr-only">{described.text}</span>
      </span>
    );
  }

  return <Dash label={described.text} />;
}

/** Gedankenstrich mit Klartext fuer Hilfsmittel (R-6.6: nie 0 statt „unbekannt"). */
function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
