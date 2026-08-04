import * as React from "react";
import { Link, useNavigate } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegend } from "@/components/charts/ChartLegend";
import {
  ChartCanvas,
  ChartDataTable,
  ChartEmpty,
  ChartTooltipBox,
} from "@/components/charts/chart";
import {
  CHART_BAR_CURSOR,
  CHART_BAR_RADIUS,
  CHART_GRID_PROPS,
  CHART_LINE_CURSOR,
  CHART_MARGIN,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
} from "@/components/charts/chartTheme";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { formatMoney, type Money } from "@/lib/money";
import { formatPayments } from "../format";
import { formatCountNumber } from "@/lib/utils/formatNumber";

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
    <ChartTooltipBox>
      <p className="font-medium">{row.label}</p>
      <p>{formatMoney(row.money)}</p>
      <p className="text-muted-foreground">{formatPayments(row.count)}</p>
    </ChartTooltipBox>
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
    return <ChartEmpty>{emptyMessage}</ChartEmpty>;
  }

  return (
    <div className="space-y-4">
      <ChartCanvas ariaLabel={ariaLabel}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} />
          <Tooltip content={<CategoryTooltip />} cursor={CHART_BAR_CURSOR} />
          <Bar
            dataKey="value"
            name="Nettodividende"
            fill="var(--chart-1)"
            radius={CHART_BAR_RADIUS}
            isAnimationActive={!reducedMotion}
            cursor="pointer"
            onClick={(entry) => {
              const row = (entry as unknown as { payload?: CategoryDatum }).payload;
              if (row?.href) void navigate(row.href);
            }}
          />
        </BarChart>
      </ChartCanvas>

      <ChartDataTable>
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
                {/* Der Drill-down lag zuvor ausschliesslich auf dem Balken —
                      als `onClick`. Damit war er per Maus erreichbar und sonst
                      gar nicht: Tastatur und Screenreader kamen nicht zu den
                      Zahlen hinter einer Kennzahl. Die Datentabelle ist der
                      zugaengliche Zwilling des Diagramms und traegt das Ziel
                      deshalb als echten Link. */}
                <th scope="row" className="py-1 pr-4 font-normal">
                  {row.href ? (
                    <Link
                      to={row.href}
                      className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </th>
                <td className="py-1 pr-4 text-right tabular-nums">
                  {formatMoney(row.money)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatCountNumber(row.count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartDataTable>
    </div>
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
    return <ChartEmpty>Keine Daten für die aktuelle Auswahl.</ChartEmpty>;
  }

  const intensity = (value: number): number => {
    if (maxValue <= 0 || value <= 0) return 0;
    // Wurzelskalierung, damit auch kleinere Monate sichtbar bleiben.
    return Math.min(1, Math.sqrt(value / maxValue));
  };

  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-separate border-spacing-1 text-sm">
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
                    {/* Die Beschriftung steht als echter, versteckter Text in
                        der Zelle — nicht als `aria-label`. Auf einem schlichten
                        `div` (Rolle `generic`) ist `aria-label` unzulaessig und
                        wird schlicht nicht vorgelesen: Monate ohne Drill-down
                        waren damit fuer Screenreader stumm. */}
                    <div
                      title={label}
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
                              "relative flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-sm text-[10px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          }
                        : {
                            className:
                              "relative flex h-9 min-w-9 items-center justify-center rounded-sm text-[10px] tabular-nums",
                          })}
                      style={style}
                    >
                      <span className="sr-only">{label}</span>
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

// ============================================================================
// Zeitraumvergleich (zwei Reihen)
// ============================================================================

/** Ein Punkt der Gegenüberstellung; beide Werte sind vorab aggregiert. */
export interface ComparisonPoint {
  label: string;
  current: number;
  reference: number;
  currentMoney: Money;
  referenceMoney: Money;
}

interface ComparisonLineChartProps {
  points: ComparisonPoint[];
  /** Beschriftung der aktuellen Reihe, z. B. „2026". */
  currentLabel: string;
  /** Beschriftung der Vergleichsreihe, z. B. „2025". */
  referenceLabel: string;
  ariaLabel: string;
}

/**
 * Kumulierter Verlauf zweier Zeitraeume als Linien.
 *
 * **Linien, keine Balken:** Gefragt ist der Verlauf — „liege ich vorn oder
 * zurueck, und seit wann?". Der Abstand zwischen zwei Linien beantwortet das
 * auf einen Blick; nebeneinanderstehende Balken muesste man Paar fuer Paar
 * lesen.
 *
 * **Farbwahl gemessen, nicht geschaetzt:** `--chart-1` (blau) gegen `--chart-2`
 * (orange) — die ersten beiden Plaetze der kategorialen Palette und zugleich
 * gegenueberliegende Farbtoene. Der Palettenvalidator meldet fuer dieses Paar
 * ΔE 25,1 (hell) bzw. 25,3 (dunkel) bei Protanopie; die Schwelle liegt bei 8.
 * Zwei benachbarte Blautoene haetten hier deutlich schlechter getrennt, und
 * genau das Auseinanderhalten ist der Zweck dieses Diagramms.
 *
 * **Identitaet haengt nicht an der Farbe allein:** Die Vergleichsreihe ist
 * zusaetzlich gestrichelt, beide Reihen sind benannt (Legende), und die
 * Datentabelle traegt dieselben Werte als Text.
 */
export function ComparisonLineChart({
  points,
  currentLabel,
  referenceLabel,
  ariaLabel,
}: ComparisonLineChartProps) {
  const reducedMotion = useReducedMotion();

  if (points.length === 0) {
    return <ChartEmpty>Keine Daten für die aktuelle Auswahl.</ChartEmpty>;
  }

  return (
    <div className="space-y-4">
      <ChartCanvas ariaLabel={ariaLabel}>
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} />
          <Tooltip
            content={
              <ComparisonTooltip
                currentLabel={currentLabel}
                referenceLabel={referenceLabel}
              />
            }
            cursor={CHART_LINE_CURSOR}
          />
          {/* Die Vergleichsreihe liegt hinten und traegt einen Strich: Der
                Blick soll zuerst auf dem aktuellen Zeitraum landen. */}
          <Line
            type="monotone"
            dataKey="reference"
            name={referenceLabel}
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={!reducedMotion}
          />
          <Line
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={!reducedMotion}
          />
        </LineChart>
      </ChartCanvas>

      <ChartLegend
        items={[
          { label: currentLabel, color: "var(--chart-1)" },
          { label: referenceLabel, color: "var(--chart-2)", dashed: true },
        ]}
      />

      <ChartDataTable>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 pr-4 font-medium">
                Monat
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-medium">
                {currentLabel}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {referenceLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.label} className="border-t border-border">
                <th scope="row" className="py-1 pr-4 font-normal">
                  {point.label}
                </th>
                <td className="py-1 pr-4 text-right tabular-nums">
                  {formatMoney(point.currentMoney)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoney(point.referenceMoney)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartDataTable>
    </div>
  );
}

interface ComparisonTooltipProps {
  active?: boolean;
  payload?: { payload?: ComparisonPoint }[];
  currentLabel: string;
  referenceLabel: string;
}

function ComparisonTooltip({
  active,
  payload,
  currentLabel,
  referenceLabel,
}: ComparisonTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{row.label}</p>
      <p>
        {currentLabel}: {formatMoney(row.currentMoney)}
      </p>
      <p className="text-muted-foreground">
        {referenceLabel}: {formatMoney(row.referenceMoney)}
      </p>
    </ChartTooltipBox>
  );
}
