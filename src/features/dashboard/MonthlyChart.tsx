import * as React from "react";
import { useNavigate } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  return reduced;
}

const axisFormatter = new Intl.NumberFormat("de-DE", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const tickFormatter = (value: number) => `${axisFormatter.format(value)} €`;

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
      const isFuture = selection === today.year && month > today.month;
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

  const title = isAll
    ? "Jährlicher Dividendenverlauf"
    : `Monatlicher Dividendenverlauf ${selectedYearLabel}`;

  const description = isAll
    ? "Netto-Dividendensumme je Kalenderjahr, chronologisch."
    : `Netto-Dividendensumme je Monat für ${selectedYearLabel} im Vergleich zu ${priorYearLabel}${
        mode === "cumulative" ? " (kumuliert)" : ""
      }.`;

  const hasData = isAll
    ? yearData.length > 0
    : monthData.some((row) => row.selected !== null && row.selected !== 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {!isAll && (
          <div className="flex shrink-0 gap-1" role="group" aria-label="Darstellung">
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
          <p className="py-12 text-center text-sm text-muted-foreground">
            {isAll
              ? "Noch keine Dividendeneingänge vorhanden."
              : `Für ${selectedYearLabel} liegen keine Dividendeneingänge vor.`}
          </p>
        ) : (
          <>
            <div
              className="h-72 w-full"
              role="img"
              aria-label={`${title}. ${description}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                {isAll ? (
                  <BarChart
                    data={yearData}
                    margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={tickFormatter}
                      tick={{ fontSize: 12 }}
                      width={64}
                      stroke="var(--muted-foreground)"
                    />
                    <Tooltip
                      content={<YearTooltip />}
                      cursor={{ fill: "var(--muted)" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Nettodividende"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reducedMotion}
                      onClick={(data) => {
                        const row = (data as unknown as { payload?: YearRow }).payload;
                        if (row) void navigate(paymentsListHref({ year: row.year }));
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                ) : (
                  <BarChart
                    data={monthData}
                    margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={tickFormatter}
                      tick={{ fontSize: 12 }}
                      width={64}
                      stroke="var(--muted-foreground)"
                    />
                    <Tooltip
                      content={
                        <MonthTooltip
                          selectedLabel={selectedYearLabel}
                          priorLabel={priorYearLabel}
                        />
                      }
                      cursor={{ fill: "var(--muted)" }}
                    />
                    <Legend />
                    <Bar
                      dataKey="prior"
                      name={priorYearLabel}
                      fill="var(--chart-6)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reducedMotion}
                    />
                    <Bar
                      dataKey="selected"
                      name={selectedYearLabel}
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
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
              </ResponsiveContainer>
            </div>

            {!isAll && monthData.some((row) => row.isFuture) && (
              <p className="text-xs text-muted-foreground">
                Monate ohne Balken im laufenden Jahr haben noch nicht begonnen; es werden
                keine Werte prognostiziert.
              </p>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Datentabelle anzeigen
              </summary>
              {isAll ? (
                <YearTable rows={yearData} />
              ) : (
                <MonthTable
                  rows={monthData}
                  selectedLabel={selectedYearLabel}
                  priorLabel={priorYearLabel}
                />
              )}
            </details>
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
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
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
    </div>
  );
}

function YearTooltip({ active, payload }: TooltipInput<YearRow>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{row.year}</p>
      <p>{formatMoney(row.money)}</p>
      <p className="text-muted-foreground">
        {row.count === 1 ? "1 Zahlung" : `${String(row.count)} Zahlungen`}
      </p>
    </div>
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
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Monatliche Netto-Dividenden {selectedLabel} und {priorLabel}
        </caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-4 font-medium">
              Monat
            </th>
            <th scope="col" className="py-1 pr-4 text-right font-medium">
              {selectedLabel}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {priorLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month} className="border-t border-border">
              <th scope="row" className="py-1 pr-4 font-normal">
                {monthNameDe(row.month)}
              </th>
              <td className="py-1 pr-4 text-right tabular-nums">
                {row.isFuture
                  ? "noch nicht begonnen"
                  : row.selectedMoney
                    ? formatMoney(row.selectedMoney)
                    : "—"}
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatMoney(row.priorMoney)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearTable({ rows }: { rows: YearRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Netto-Dividenden je Jahr</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-4 font-medium">
              Jahr
            </th>
            <th scope="col" className="py-1 pr-4 text-right font-medium">
              Nettodividende
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Zahlungen
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year} className="border-t border-border">
              <th scope="row" className="py-1 pr-4 font-normal">
                {row.year}
              </th>
              <td className="py-1 pr-4 text-right tabular-nums">
                {formatMoney(row.money)}
              </td>
              <td className="py-1 text-right tabular-nums">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
