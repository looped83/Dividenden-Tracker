import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { BarChart3, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { AmountText } from "@/components/money/AmountText";
import { cn } from "@/lib/utils/cn";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  breakdownMatrix,
  filterPayments,
  monthNameDe,
  monthNameDeShort,
  refDateFromDate,
  type BreakdownCell,
  type BreakdownMatrix,
  type BreakdownYearColumn,
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
 * Breakdown (Statistik §11.12): alle Jahre und Monate in **einer** Tabelle.
 *
 * Bewusst ohne Diagramm. „Jahre" und „Monate" zeigen jeweils eine Achse und
 * runden zur Form; hier geht es um den Abgleich Zahl gegen Zahl — Januar 2024
 * gegen Januar 2025 gegen Januar 2026. Dafuer ist die Tabelle das genauere
 * Werkzeug, und jede Zahl fuehrt in die Zahlungsliste dahinter (§11.9).
 *
 * Die Rechnung liegt vollstaendig in `lib/statistics/breakdown`; diese Seite
 * stellt dar und benennt, was die Zahlen einschraenkt: das laufende Jahr, den
 * laufenden Monat und den Divisor der Ø-Spalte.
 *
 * Der Jahresfilter der Statistikleiste bleibt hier wirkungslos — er reduzierte
 * die Matrix auf eine einzige Spalte und damit auf das, was „Monate" ohnehin
 * zeigt. Alle uebrigen Filter wirken.
 */
export function BreakdownTab() {
  const { allPayments, filter } = useStatisticsContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = React.useMemo(() => refDateFromDate(), []);
  const view = parseBreakdownView(searchParams);

  const yearlessFilter = React.useMemo(() => ({ ...filter, year: null }), [filter]);
  const payments = React.useMemo(
    () => filterPayments(allPayments, yearlessFilter),
    [allPayments, yearlessFilter],
  );
  const matrix = React.useMemo(() => breakdownMatrix(payments, today), [payments, today]);

  const setView = (next: BreakdownView) => {
    setSearchParams((prev) => applyBreakdownView(prev, next), { replace: false });
  };

  // Ø und Gesamt sind Summen ueber die Jahre. Sie ergeben nur neben absoluten
  // Monatssummen einen Sinn: Veraenderungen lassen sich nicht addieren, und
  // aufgelaufene Werte enthalten die Vormonate bereits.
  const showAggregates = view === "summe";
  const runningYear = matrix.years.find((column) => column.running);

  if (matrix.years.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Daten für den Breakdown"
        description="Für den aktuellen Filter liegen keine Dividendeneingänge vor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Jahre × Monate</CardTitle>
          <p className="text-sm text-muted-foreground">
            Eine Zeile je Monat, eine Spalte je Jahr — der gesamte Bestand auf einen
            Blick. Jeder Betrag öffnet die zugehörigen Dividendeneingänge.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block max-w-xs space-y-1.5">
            <span className="text-sm font-medium">Ansicht</span>
            <Select
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
          </label>

          {filter.year !== null && (
            <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Der Jahresfilter ({filter.year}) wirkt in diesem Bereich nicht — der
                Breakdown stellt alle Jahre gegenüber. Alle übrigen Filter gelten
                weiterhin.
              </span>
            </p>
          )}

          <BreakdownMatrixTable
            matrix={matrix}
            view={view}
            filter={filter}
            showAggregates={showAggregates}
          />

          <ul className="space-y-1 text-sm text-muted-foreground">
            {runningYear && (
              <li>
                <span aria-hidden>* </span>
                {runningYear.year} läuft noch — gerechnet bis{" "}
                {formatIsoDate(matrix.cutoff)}. Der Vorjahresvergleich endet auf beiden
                Seiten an diesem Tag, damit kein angefangener Zeitraum gegen einen vollen
                steht.
              </li>
            )}
            {showAggregates && (
              <li>
                <span aria-hidden>Ø: </span>
                {matrix.completedYears > 0
                  ? `Durchschnitt über die ${String(matrix.completedYears)} abgeschlossenen ${
                      matrix.completedYears === 1 ? "Jahr" : "Jahre"
                    } — das laufende Jahr zählt nicht mit, weil noch nicht erreichte Monate den Schnitt drücken würden.`
                  : "Noch kein abgeschlossenes Jahr vorhanden."}
              </li>
            )}
            {view === "veraenderung" && (
              <li>
                Verglichen wird jeder Monat mit demselben Monat des Vorjahres. Fehlt das
                Vorjahr in den Daten, steht ein Gedankenstrich — nie eine gerechnete
                Prozentzahl ohne Grundlage.
              </li>
            )}
            <li>
              Monate, die noch nicht erreicht sind, bleiben leer. Ein Monat ohne Zahlungen
              steht als <span aria-hidden>„—"</span>
              <span className="sr-only">Gedankenstrich</span>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Matrix
// ============================================================================

interface MatrixProps {
  matrix: BreakdownMatrix;
  view: BreakdownView;
  filter: StatisticsFilter;
  showAggregates: boolean;
}

/**
 * Die Matrix selbst.
 *
 * **Waagerecht verschiebbar statt umgebrochen.** Eine Matrix laesst sich nicht
 * in Karten aufloesen, ohne genau das zu verlieren, wofuer sie da ist: den
 * Vergleich nebeneinander. Die Monatsspalte bleibt deshalb beim Schieben stehen
 * (`sticky`), sodass jede Zahl ihre Zeile behaelt — auch auf dem Telefon.
 *
 * `border-separate` statt `border-collapse`: Zusammengefasste Rahmen
 * verschwinden in mehreren Browsern unter `position: sticky`. Die Linien liegen
 * deshalb an den Zellen.
 */
function BreakdownMatrixTable({ matrix, view, filter, showAggregates }: MatrixProps) {
  const caption =
    view === "veraenderung"
      ? "Veränderung der Netto-Dividenden je Monat gegenüber dem Vorjahresmonat, Zeilen je Monat, Spalten je Jahr"
      : view === "kumuliert"
        ? "Aufgelaufene Netto-Dividenden je Jahr, Zeilen je Monat, Spalten je Jahr"
        : "Netto-Dividenden je Monat und Jahr, Zeilen je Monat, Spalten je Jahr";

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Monat
            </th>
            {matrix.years.map((column) => (
              <YearHeader key={column.year} column={column} />
            ))}
            {showAggregates && (
              <>
                <th
                  scope="col"
                  className="whitespace-nowrap border-b border-l border-border bg-muted px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  title="Durchschnitt über die abgeschlossenen Jahre"
                >
                  Ø
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Gesamt
                </th>
              </>
            )}
          </tr>
        </thead>

        <tbody>
          {matrix.months.map((row) => (
            <tr key={row.month}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-medium"
              >
                {monthNameDeShort(row.month)}
                <span className="sr-only"> {monthNameDe(row.month)}</span>
              </th>
              {row.cells.map((cell) => (
                <td
                  key={cell.year}
                  className={cn(
                    "whitespace-nowrap border-b border-border px-3 py-2 text-right tabular-nums",
                    cell.future && "bg-muted/40",
                  )}
                >
                  <MatrixCell cell={cell} view={view} filter={filter} />
                </td>
              ))}
              {showAggregates && (
                <>
                  <td className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {/* Ein Monat, in dem nie etwas kam, hat keinen Durchschnitt
                        — „0,00 €" neben dem Gedankenstrich der Gesamtspalte
                        waeren zwei Aussagen ueber dieselbe Leere. */}
                    {row.count === 0 || !row.average ? (
                      <Dash
                        label={
                          row.count === 0
                            ? "Keine Zahlungen"
                            : "Kein abgeschlossenes Jahr"
                        }
                      />
                    ) : (
                      <AmountText amount={row.average} />
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-border px-3 py-2 text-right font-medium tabular-nums">
                    {row.count === 0 ? (
                      <Dash label="Keine Zahlungen" />
                    ) : (
                      <span title={formatPayments(row.count)}>
                        <AmountText amount={row.net} />
                      </span>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 border-r border-border bg-muted px-3 py-2 text-left font-medium"
            >
              Gesamt
            </th>
            {matrix.years.map((column) => (
              <td
                key={column.year}
                className="whitespace-nowrap bg-muted px-3 py-2 text-right font-medium tabular-nums"
                title={`${String(column.year)}: ${formatMoney(column.net)} · ${formatPayments(
                  column.count,
                )} · Zahlungen in ${String(column.activeMonths)} von 12 Monaten`}
              >
                <AmountText amount={column.net} />
                {column.running && <span aria-hidden>*</span>}
              </td>
            ))}
            {showAggregates && (
              <>
                <td className="whitespace-nowrap border-l border-border bg-muted px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {matrix.totals.average ? (
                    <AmountText amount={matrix.totals.average} />
                  ) : (
                    <Dash label="Kein abgeschlossenes Jahr" />
                  )}
                </td>
                <td className="whitespace-nowrap bg-muted px-3 py-2 text-right font-semibold tabular-nums">
                  <span title={formatPayments(matrix.totals.count)}>
                    <AmountText amount={matrix.totals.net} />
                  </span>
                </td>
              </>
            )}
          </tr>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 whitespace-nowrap border-r border-t border-border bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Δ Vorjahr
            </th>
            {matrix.years.map((column) => (
              <td
                key={column.year}
                className="whitespace-nowrap border-t border-border bg-muted px-3 py-2 text-right tabular-nums"
              >
                <ChangeValue change={column.change} context="ggü. Vorjahr" />
              </td>
            ))}
            {showAggregates && (
              <>
                <td className="border-l border-t border-border bg-muted px-3 py-2" />
                <td className="border-t border-border bg-muted px-3 py-2" />
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function YearHeader({ column }: { column: BreakdownYearColumn }) {
  return (
    <th
      scope="col"
      className="whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      {column.year}
      {column.running && (
        <>
          <span aria-hidden>*</span>
          <span className="sr-only"> (laufendes Jahr)</span>
        </>
      )}
    </th>
  );
}

/** Zellinhalt je Ansicht. */
function MatrixCell({
  cell,
  view,
  filter,
}: {
  cell: BreakdownCell;
  view: BreakdownView;
  filter: StatisticsFilter;
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

  const amount = view === "kumuliert" ? cell.cumulative : cell.net;

  if (view === "kumuliert") {
    return amount.isZero() ? (
      <Dash label={`${period}: noch nichts aufgelaufen`} />
    ) : (
      <span title={`${period}: ${formatMoney(amount)} seit Jahresbeginn`}>
        <AmountText amount={amount} />
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
      <AmountText amount={cell.net} />
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
