import * as React from "react";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartLegend } from "@/components/charts/ChartLegend";
import {
  ChartCanvas,
  ChartDataTable,
  ChartEmpty,
  ChartRowHeader,
  ChartTooltipBox,
} from "@/components/charts/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHART_BAR_CURSOR,
  CHART_BAR_RADIUS,
  CHART_GRID_PROPS,
  CHART_MARGIN,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
} from "@/components/charts/chartTheme";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { EUR, Money, formatMoney } from "@/lib/money";
import {
  comparePeriods,
  MONTH_NAMES_DE_SHORT,
  monthNameDe,
  monthlyBuckets,
  yearlyBuckets,
  type AnalyticsPayment,
  type YearSelection,
  type RefDate,
} from "@/lib/statistics";
import { describeComparison, paymentsListHref } from "./format";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";

type ChartMode = "monthly" | "cumulative";

interface MonthRow {
  label: string;
  month: number;
  selected: number | null;
  prior: number | null;
  selectedMoney: Money | null;
  priorMoney: Money;
  isFuture: boolean;
}

interface YearRow {
  label: string;
  year: number;
  value: number;
  money: Money;
  count: number;
}

interface MonthlyChartProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/**
 * Zentrales Dashboarddiagramm (§7/§8): Einzeljahr als gruppiertes Balken-
 * diagramm (ausgewaehltes Jahr vs. Vorjahr), „Alle Jahre" als Jahresentwicklung.
 * Zukuenftige Monate des laufenden Jahres erscheinen nicht als Nullwerte,
 * sondern als Luecke (kein Balken) und werden im Text gekennzeichnet. Zu jedem
 * Diagramm gibt es eine zugaengliche Datentabelle (§17).
 */
export function MonthlyChart({ payments, selection, today }: MonthlyChartProps) {
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<ChartMode>("monthly");
  const isAll = selection === "all";

  const monthData = React.useMemo<MonthRow[]>(() => {
    if (isAll || typeof selection !== "number") return [];
    const selectedBuckets = monthlyBuckets(payments, selection);
    const priorBuckets = monthlyBuckets(payments, selection - 1);
    let cumulativeSelected = Money.zero(EUR);
    let cumulativePrior = Money.zero(EUR);
    return selectedBuckets.map((bucket, index) => {
      const month = index + 1;
      // „Noch nicht begonnen" gilt nur fuer Monate ohne Zahlungen: durch den
      // Ausschuettungsplan (§10) kann eine frueh eingetroffene Zahlung bereits
      // im kommenden Monat stehen — dieses Geld darf nicht als Luecke
      // verschwinden.
      const isFuture =
        selection === today.year && month > today.month && bucket.count === 0;
      const priorNet = priorBuckets[index]?.net ?? Money.zero(EUR);
      cumulativePrior = cumulativePrior.add(priorNet);

      let selectedMoney: Money | null;
      if (isFuture) {
        selectedMoney = null; // keine Fortschreibung in die Zukunft
      } else if (mode === "cumulative") {
        cumulativeSelected = cumulativeSelected.add(bucket.net);
        selectedMoney = cumulativeSelected;
      } else {
        selectedMoney = bucket.net;
      }
      const priorMoney = mode === "cumulative" ? cumulativePrior : priorNet;

      return {
        label: MONTH_NAMES_DE_SHORT[index] ?? String(month),
        month,
        selected: selectedMoney ? selectedMoney.toChartNumber() : null,
        prior: priorMoney.toChartNumber(),
        selectedMoney,
        priorMoney,
        isFuture,
      };
    });
  }, [isAll, selection, payments, today, mode]);

  const yearData = React.useMemo<YearRow[]>(() => {
    if (!isAll) return [];
    return yearlyBuckets(payments).map((bucket) => ({
      label: String(bucket.year),
      year: bucket.year,
      value: bucket.net.toChartNumber(),
      money: bucket.net,
      count: bucket.count,
    }));
  }, [isAll, payments]);

  const selectedYearLabel = typeof selection === "number" ? String(selection) : "";
  const priorYearLabel = typeof selection === "number" ? String(selection - 1) : "";

  // „Monatlicher"/„Jährlicher" sagte, was die X-Achse ohnehin zeigt. Die
  // Jahreszahl bleibt: Sie ist die Angabe, die man aus der Ueberschrift braucht.
  const title = isAll ? "Dividendenverlauf" : `Dividendenverlauf ${selectedYearLabel}`;

  // Nur fuer Hilfsmittel: Das Diagramm traegt keine sichtbare Unterzeile mehr,
  // aber ein `role="img"` braucht eine Beschreibung, die ueber den Titel
  // hinausgeht — sonst bliebe unklar, was die Achsen zeigen.
  const chartDescription = isAll
    ? "Netto-Dividendensumme je Kalenderjahr, chronologisch."
    : `Netto-Dividendensumme je Monat für ${selectedYearLabel} im Vergleich zu ${priorYearLabel}${
        mode === "cumulative" ? " (kumuliert)" : ""
      }.`;

  const hasData = isAll
    ? yearData.length > 0
    : monthData.some((row) => row.selected !== null && row.selected !== 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <CardTitle className="min-w-0">{title}</CardTitle>
        {!isAll && (
          <div className="-my-2 flex gap-1" role="group" aria-label="Darstellung">
            <Button
              type="button"
              size="sm"
              variant={mode === "monthly" ? "default" : "outline"}
              aria-pressed={mode === "monthly"}
              onClick={() => {
                setMode("monthly");
              }}
            >
              Monatswerte
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "cumulative" ? "default" : "outline"}
              aria-pressed={mode === "cumulative"}
              onClick={() => {
                setMode("cumulative");
              }}
            >
              Kumuliert
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <ChartEmpty>
            {isAll
              ? "Noch keine Dividendeneingänge vorhanden."
              : `Für ${selectedYearLabel} liegen keine Dividendeneingänge vor.`}
          </ChartEmpty>
        ) : (
          <>
            <ChartCanvas ariaLabel={`${title}. ${chartDescription}`}>
              {isAll ? (
                <BarChart data={yearData} margin={CHART_MARGIN}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} />
                  <YAxis {...CHART_Y_AXIS_PROPS} />
                  <Tooltip content={<YearTooltip />} cursor={CHART_BAR_CURSOR} />
                  <Bar
                    dataKey="value"
                    name="Nettodividende"
                    fill="var(--chart-1)"
                    radius={CHART_BAR_RADIUS}
                    isAnimationActive={!reducedMotion}
                    onClick={(data) => {
                      const row = (data as unknown as { payload?: YearRow }).payload;
                      if (row) void navigate(paymentsListHref({ year: row.year }));
                    }}
                    cursor="pointer"
                  />
                </BarChart>
              ) : (
                <BarChart data={monthData} margin={CHART_MARGIN}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} />
                  <YAxis {...CHART_Y_AXIS_PROPS} />
                  <Tooltip
                    content={
                      <MonthTooltip
                        selectedLabel={selectedYearLabel}
                        priorLabel={priorYearLabel}
                      />
                    }
                    cursor={CHART_BAR_CURSOR}
                  />
                  <Bar
                    dataKey="prior"
                    name={priorYearLabel}
                    fill="var(--chart-2)"
                    radius={CHART_BAR_RADIUS}
                    isAnimationActive={!reducedMotion}
                  />
                  <Bar
                    dataKey="selected"
                    name={selectedYearLabel}
                    fill="var(--chart-1)"
                    radius={CHART_BAR_RADIUS}
                    isAnimationActive={!reducedMotion}
                    onClick={(data) => {
                      const row = (data as unknown as { payload?: MonthRow }).payload;
                      if (row && !row.isFuture && typeof selection === "number") {
                        void navigate(
                          paymentsListHref({ year: selection, month: row.month }),
                        );
                      }
                    }}
                    cursor="pointer"
                  />
                </BarChart>
              )}
            </ChartCanvas>

            {/* Nur der Jahresvergleich hat zwei Reihen; die reine Jahresreihe
                braucht keine Legende. */}
            {!isAll && (
              <ChartLegend
                items={[
                  { label: priorYearLabel, color: "var(--chart-2)" },
                  { label: selectedYearLabel, color: "var(--chart-1)" },
                ]}
              />
            )}

            <ChartDataTable>
              {isAll ? (
                <YearTable rows={yearData} />
              ) : (
                <MonthTable
                  rows={monthData}
                  selectedLabel={selectedYearLabel}
                  priorLabel={priorYearLabel}
                />
              )}
            </ChartDataTable>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Tooltips ---------------------------------------------------------------

interface TooltipInput<T> {
  active?: boolean;
  payload?: { payload: T }[];
}

function MonthTooltip({
  active,
  payload,
  selectedLabel,
  priorLabel,
}: TooltipInput<MonthRow> & { selectedLabel: string; priorLabel: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const comparison =
    row.selectedMoney !== null
      ? describeComparison(
          comparePeriods(row.selectedMoney, row.priorMoney),
          "ggü. Vorjahr",
        )
      : null;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{monthNameDe(row.month)}</p>
      {row.isFuture ? (
        <p className="text-muted-foreground">Noch nicht begonnen</p>
      ) : (
        <>
          <p>
            {selectedLabel}: {row.selectedMoney ? formatMoney(row.selectedMoney) : "—"}
          </p>
          <p className="text-muted-foreground">
            {priorLabel}: {formatMoney(row.priorMoney)}
          </p>
          {comparison && <p className="mt-1 text-xs">{comparison.text}</p>}
        </>
      )}
    </ChartTooltipBox>
  );
}

function YearTooltip({ active, payload }: TooltipInput<YearRow>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{row.year}</p>
      <p>{formatMoney(row.money)}</p>
      <p className="text-muted-foreground">
        {formatCountNoun(row.count, "Zahlung", "Zahlungen")}
      </p>
    </ChartTooltipBox>
  );
}

// --- Zugaengliche Tabellen ---------------------------------------------------

function MonthTable({
  rows,
  selectedLabel,
  priorLabel,
}: {
  rows: MonthRow[];
  selectedLabel: string;
  priorLabel: string;
}) {
  return (
    <Table>
      <caption className="sr-only">
        Monatliche Netto-Dividenden {selectedLabel} und {priorLabel}
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead>Monat</TableHead>
          <TableHead className="text-right">{selectedLabel}</TableHead>
          <TableHead className="text-right">{priorLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.month}>
            <ChartRowHeader>{monthNameDe(row.month)}</ChartRowHeader>
            <TableCell className="text-right tabular-nums">
              {row.isFuture
                ? "noch nicht begonnen"
                : row.selectedMoney
                  ? formatMoney(row.selectedMoney)
                  : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.priorMoney)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function YearTable({ rows }: { rows: YearRow[] }) {
  return (
    <Table>
      <caption className="sr-only">Netto-Dividenden je Jahr</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Jahr</TableHead>
          <TableHead className="text-right">Nettodividende</TableHead>
          <TableHead className="text-right">Zahlungen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.year}>
            <ChartRowHeader>{row.year}</ChartRowHeader>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.money)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCountNumber(row.count)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
