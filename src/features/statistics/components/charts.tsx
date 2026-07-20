import * as React from "react";
import { useNavigate } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, type Money } from "@/lib/money";
import { formatPayments } from "../format";

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

/** Vorberechneter Balkenpunkt. Die Werte stammen ausschliesslich aus der Analytics-Schicht. */
export interface CategoryDatum {
  key: string;
  label: string;
  /** Rein visueller Balkenwert (Money.toChartNumber, §1). */
  value: number;
  money: Money;
  count: number;
  /** Optionales Drill-down-Ziel. */
  href?: string;
}

interface CategoryTooltipProps {
  active?: boolean;
  payload?: { payload: CategoryDatum }[];
}

function CategoryTooltip({ active, payload }: CategoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{row.label}</p>
      <p>{formatMoney(row.money)}</p>
      <p className="text-muted-foreground">{formatPayments(row.count)}</p>
    </div>
  );
}

interface CategoryBarChartProps {
  data: CategoryDatum[];
  /** Beschriftung fuer das `role="img"` und die Datentabelle. */
  ariaLabel: string;
  /** Ueberschrift der Kategoriespalte in der Datentabelle. */
  categoryHeader: string;
  emptyMessage?: string;
}

/**
 * Vertikales Balkendiagramm fuer Zeitreihen (Jahres-/Monatsentwicklung).
 * Enthaelt **keine** Berechnung — alle Werte sind vorab aggregiert. Zu jedem
 * Diagramm gehoert eine zugaengliche Datentabelle (§17). Ein Klick auf einen
 * Balken folgt dem hinterlegten Drill-down-Ziel.
 */
export function CategoryBarChart({
  data,
  ariaLabel,
  categoryHeader,
  emptyMessage = "Keine Daten für die aktuelle Auswahl.",
}: CategoryBarChartProps) {
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();

  if (data.length === 0 || data.every((row) => row.value === 0)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
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
            <Tooltip content={<CategoryTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar
              dataKey="value"
              name="Nettodividende"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
              cursor="pointer"
              onClick={(entry) => {
                const row = (entry as unknown as { payload?: CategoryDatum }).payload;
                if (row?.href) void navigate(row.href);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Datentabelle anzeigen
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="py-1 pr-4 font-medium">
                  {categoryHeader}
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
              {data.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <th scope="row" className="py-1 pr-4 font-normal">
                    {row.label}
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
      </details>
    </div>
  );
}

export interface SparkPoint {
  label: string;
  value: number;
  money: Money;
}

interface YearSparklineProps {
  points: SparkPoint[];
  maxValue: number;
}

/**
 * Kompakte, rein visuelle Balken-Sparkline zur „Entwicklung über die Jahre"
 * (§11.4/§11.5). Enthaelt keine Berechnung; ein Screenreader liest die Werte
 * als Text. Fuer sehende Nutzer zeigt der Titel je Balken Jahr und Betrag.
 */
export function YearSparkline({ points, maxValue }: YearSparklineProps) {
  if (points.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const srText = points
    .map((point) => `${point.label}: ${formatMoney(point.money)}`)
    .join(", ");
  return (
    <span className="inline-flex items-end gap-0.5" role="img" aria-label={srText}>
      {points.map((point) => {
        const height = maxValue > 0 ? Math.max(8, (point.value / maxValue) * 100) : 8;
        return (
          <span
            key={point.label}
            title={`${point.label}: ${formatMoney(point.money)}`}
            aria-hidden
            className="block w-1.5 rounded-sm bg-chart-1"
            style={{
              height: `${String(Math.round(height * 0.24))}px`,
              backgroundColor: "var(--chart-1)",
            }}
          />
        );
      })}
    </span>
  );
}

export interface HeatmapCell {
  month: number;
  net: Money;
  count: number;
  value: number;
}

export interface HeatmapRowData {
  year: number;
  cells: HeatmapCell[];
}

interface PaymentsHeatmapProps {
  rows: HeatmapRowData[];
  monthLabels: readonly string[];
  /** Groesster Monatswert ueber alle Zellen (Intensitaetsskala). */
  maxValue: number;
  /** Drill-down je Zelle. */
  hrefOf?: (year: number, month: number) => string;
}

/**
 * Heatmap der Nettodividenden nach Jahr (Zeile) und Monat (Spalte, §11.7). Die
 * Farbintensitaet ist rein visuell; die zugrunde liegenden Betraege stammen aus
 * der Analytics-Schicht. Jede Zelle ist per Titel und Screenreader-Text
 * beschriftet und optional als Drill-down verlinkt.
 */
export function PaymentsHeatmap({
  rows,
  monthLabels,
  maxValue,
  hrefOf,
}: PaymentsHeatmapProps) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Keine Daten für die aktuelle Auswahl.
      </p>
    );
  }

  const intensity = (value: number): number => {
    if (maxValue <= 0 || value <= 0) return 0;
    // Wurzelskalierung, damit auch kleinere Monate sichtbar bleiben.
    return Math.min(1, Math.sqrt(value / maxValue));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">
          Netto-Dividenden nach Jahr (Zeile) und Monat (Spalte)
        </caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left text-xs text-muted-foreground">
              Jahr
            </th>
            {monthLabels.map((label, index) => (
              <th
                key={index}
                scope="col"
                className="px-1 py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <th scope="row" className="px-2 py-1 text-left text-xs font-medium">
                {row.year}
              </th>
              {row.cells.map((cell) => {
                const alpha = intensity(cell.value);
                const label = `${monthLabels[cell.month - 1] ?? ""} ${String(row.year)}: ${formatMoney(cell.net)}, ${formatPayments(cell.count)}`;
                const href = cell.count > 0 ? hrefOf?.(row.year, cell.month) : undefined;
                const style: React.CSSProperties = {
                  backgroundColor:
                    alpha > 0
                      ? `color-mix(in srgb, var(--chart-1) ${String(Math.round(alpha * 100))}%, transparent)`
                      : "var(--muted)",
                };
                return (
                  <td key={cell.month} className="p-0">
                    <div
                      title={label}
                      aria-label={label}
                      {...(href
                        ? {
                            role: "button",
                            tabIndex: 0,
                            onClick: () => void navigate(href),
                            onKeyDown: (event: React.KeyboardEvent) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void navigate(href);
                              }
                            },
                            className:
                              "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-sm text-[10px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          }
                        : {
                            className:
                              "flex h-9 min-w-9 items-center justify-center rounded-sm text-[10px] tabular-nums",
                          })}
                      style={style}
                    >
                      {alpha > 0.55 && (
                        <span className="sr-only">{formatMoney(cell.net)}</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
