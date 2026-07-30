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
 * stellt dar und benennt, was die Zahlen einschraenkt: das laufende Jahr und
 * den laufenden Monat.
 *
 * Der Jahresfilter der Statistikleiste bleibt hier wirkungslos — er reduzierte
 * die Matrix auf eine einzige Zeile und damit auf das, was „Monate" ohnehin
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

  const runningYear = matrix.years.find((row) => row.running);

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
        {/* Die Ansichtswahl steht in der Kopfzeile rechts: Sie gehoert zur
            Kachel, nicht zu ihrem Inhalt, und braucht dort keine eigene
            Beschriftung — die Auswahl benennt sich selbst („Summe je Monat").
            Fuer Hilfsmittel traegt sie den Namen als `aria-label`. */}
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle>Jahre × Monate</CardTitle>
          <div className="sm:w-56 sm:shrink-0">
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
                Der Jahresfilter ({filter.year}) wirkt in diesem Bereich nicht — der
                Breakdown stellt alle Jahre gegenüber. Alle übrigen Filter gelten
                weiterhin.
              </span>
            </p>
          )}

          <BreakdownMatrixTable matrix={matrix} view={view} filter={filter} />

          {/* Einziger Hinweis unter der Tabelle: das Sternchen am laufenden
              Jahr. Alles Weitere steht dort, wo es gebraucht wird — als Titel
              und Screenreader-Text an der jeweiligen Zelle. */}
          {runningYear && (
            <p className="text-sm text-muted-foreground">
              <span aria-hidden>* </span>
              {`${String(runningYear.year)} läuft noch — gerechnet bis ${formatIsoDate(
                matrix.cutoff,
              )}.`}
            </p>
          )}
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
 */
function BreakdownMatrixTable({ matrix, view, filter }: MatrixProps) {
  const caption =
    view === "veraenderung"
      ? "Veränderung der Netto-Dividenden je Monat gegenüber dem Vorjahresmonat, Zeilen je Jahr, Spalten je Monat"
      : view === "kumuliert"
        ? "Aufgelaufene Netto-Dividenden im Jahresverlauf, Zeilen je Jahr, Spalten je Monat"
        : "Netto-Dividenden je Monat und Jahr, Zeilen je Jahr, Spalten je Monat";

  return (
    // `relative` ist hier keine Kosmetik: Die Beschriftungen fuer Hilfsmittel
    // (`sr-only`) sind absolut positioniert. Ohne positionierten Vorfahren ist
    // ihr Bezugsrahmen das Dokument — der seitliche Bildlauf dieses Kastens
    // klammert sie dann nicht ein, und die Seite selbst laesst sich bis zur
    // rechten Tabellenkante schieben, obwohl dort nichts Sichtbares steht.
    <div className="relative w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
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

  if (view === "kumuliert") {
    return cell.cumulative.isZero() ? (
      <Dash label={`${period}: noch nichts aufgelaufen`} />
    ) : (
      <span title={`${period}: ${formatMoney(cell.cumulative)} seit Jahresbeginn`}>
        <AmountText amount={cell.cumulative} />
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
