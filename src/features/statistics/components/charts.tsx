import { useId } from "react";
import { Link, useNavigate } from "react-router";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Rectangle,
  type BarShapeProps,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  CHART_MAX_BAR_SIZE,
  CHART_GRID_PROPS,
  CHART_LINE_CURSOR,
  CHART_MARGIN,
  CHART_SERIES_PROPS,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
} from "@/components/charts/chartTheme";
import {
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
  type Money,
} from "@/lib/money";
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
  /** Ueberschrift im Tooltip und in der Datentabelle, wenn sie mehr sagt als die Achse. */
  detail?: string;
  /** Hebt den Balken in der Akzentfarbe hervor (z. B. die gerade geoeffnete Dividende). */
  highlight?: boolean;
  /** Groesste Beitraege im Tooltip (Bestand › Prognose). */
  breakdown?: readonly { name: string; money: Money }[];
}

interface CategoryTooltipProps {
  active?: boolean;
  payload?: { payload: CategoryDatum }[];
  showCount?: boolean;
}

function CategoryTooltip({ active, payload, showCount = true }: CategoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{row.detail ?? row.label}</p>
      <p>{formatMoney(row.money)}</p>
      {showCount && <p className="text-muted-foreground">{formatPayments(row.count)}</p>}
      {row.breakdown && row.breakdown.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {row.breakdown.map((item) => (
            <li key={item.name} className="flex justify-between gap-4">
              <span className="truncate">{item.name}</span>
              <span className="tabular-nums">{formatMoney(item.money)}</span>
            </li>
          ))}
        </ul>
      )}
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
  /**
   * Farbe der Balken. Zeitverläufe (Statistik › Verlauf) stehen in der
   * Akzentfarbe wie der laufende Zeitraum auf der Übersicht; Ranglisten
   * bleiben in Vordergrundfarbe.
   */
  color?: "foreground" | "primary";
  /**
   * Anzahl der Zahlungen in Tooltip und Tabelle. Aus, wenn jeder Balken genau
   * eine Zahlung ist — „1 Zahlung" unter jedem Betrag saete nur Rauschen.
   */
  showCount?: boolean;
  /** Reihenfolge der Datentabelle; „desc" zeigt das Juengste zuerst. */
  tableOrder?: "asc" | "desc";
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
  color = "foreground",
  showCount = true,
  tableOrder = "asc",
}: CategoryBarChartProps) {
  const navigate = useNavigate();

  const hasDrillDown = data.some((row) => row.href !== undefined);
  const hasHighlight = data.some((row) => row.highlight);

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
          <Tooltip
            content={<CategoryTooltip showCount={showCount} />}
            cursor={CHART_BAR_CURSOR}
          />
          <Bar
            dataKey="value"
            name="Nettodividende"
            fill={`var(--${color})`}
            radius={CHART_BAR_RADIUS}
            maxBarSize={CHART_MAX_BAR_SIZE}
            {...CHART_SERIES_PROPS}
            cursor={hasDrillDown ? "pointer" : undefined}
            onClick={(entry) => {
              const row = (entry as unknown as { payload?: CategoryDatum }).payload;
              if (row?.href) void navigate(row.href);
            }}
            // Ein hervorgehobener Balken in der Akzentfarbe, die uebrigen wie
            // sonst. Nur dann eine eigene Form — ohne Hervorhebung bleibt der
            // Standardbalken.
            {...(hasHighlight && {
              shape: (props: BarShapeProps) => (
                <Rectangle
                  {...props}
                  fill={
                    (props.payload as CategoryDatum).highlight
                      ? "var(--primary)"
                      : `var(--${color})`
                  }
                />
              ),
            })}
          />
        </BarChart>
      </ChartCanvas>

      <ChartDataTable>
        <Table>
          <caption className="sr-only">{ariaLabel}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>{categoryHeader}</TableHead>
              <TableHead className="text-right">Nettodividende</TableHead>
              {showCount && <TableHead className="text-right">Anzahl</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tableOrder === "desc" ? data.toReversed() : data).map((row) => (
              <TableRow key={row.key}>
                {/* Der Drill-down lag zuvor ausschliesslich auf dem Balken —
                    als `onClick`. Damit war er per Maus erreichbar und sonst
                    gar nicht: Tastatur und Screenreader kamen nicht zu den
                    Zahlen hinter einer Kennzahl. Die Datentabelle ist der
                    zugaengliche Zwilling des Diagramms und traegt das Ziel
                    deshalb als echten Link. */}
                <ChartRowHeader>
                  {row.href ? (
                    <Link
                      to={row.href}
                      className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    (row.detail ?? row.label)
                  )}
                </ChartRowHeader>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.money)}
                </TableCell>
                {showCount && (
                  <TableCell className="text-right tabular-nums">
                    {formatCountNumber(row.count)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartDataTable>
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

const LINE_X_PADDING = { left: 28, right: 28 } as const;

interface ComparisonLineChartProps {
  points: ComparisonPoint[];
  /** Beschriftung der aktuellen Reihe, z. B. „2026". */
  currentLabel: string;
  /** Beschriftung der Vergleichsreihe, z. B. „2025". */
  referenceLabel: string;
  ariaLabel: string;
  /** Legende unter dem Diagramm; aus, wo die Auswahl darueber die Reihen schon benennt. */
  showLegend?: boolean;
}

/**
 * Kumulierter Verlauf zweier Zeitraeume als Linien.
 *
 * **Linien, keine Balken:** Gefragt ist der Verlauf — „liege ich vorn oder
 * zurueck, und seit wann?". Der Abstand zwischen zwei Linien beantwortet das
 * auf einen Blick; nebeneinanderstehende Balken muesste man Paar fuer Paar
 * lesen.
 *
 * **Farben wie der Kopf der Uebersicht** (seit 1.12.0): der aktuelle
 * Zeitraum in der Akzentfarbe (Orange), die Referenz in `--series-prior`
 * (neutrales Grau, 3,6:1 hell / 3,5:1 dunkel) und gestrichelt.
 *
 * **Identitaet haengt nicht an der Farbe allein:** Die Vergleichsreihe ist
 * zusaetzlich gestrichelt, beide Reihen sind benannt (Legende oder Auswahl
 * darueber, dazu der Tooltip), und die
 * Datentabelle traegt dieselben Werte als Text.
 */
export function ComparisonLineChart({
  points,
  currentLabel,
  referenceLabel,
  ariaLabel,
  showLegend = true,
}: ComparisonLineChartProps) {
  if (points.length === 0) {
    return <ChartEmpty>Keine Daten für die aktuelle Auswahl.</ChartEmpty>;
  }

  return (
    <div className="space-y-4">
      <ChartCanvas ariaLabel={ariaLabel}>
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          {/* Abstand an beiden Enden: Bei Linien sitzen der erste und der
              letzte Punkt genau auf dem Rand, ihre Beschriftung ragte halb
              darueber hinaus. Recharts verwirft solche Beschriftungen — und
              mit der ersten jeden Takt, der sie enthaelt —, sodass nur die
              letzte uebrig blieb. 28px fassen ein halbes „22.10.26". */}
          <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} padding={LINE_X_PADDING} />
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
            type="linear"
            dataKey="reference"
            name={referenceLabel}
            stroke="var(--series-prior)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 5 }}
            {...CHART_SERIES_PROPS}
          />
          <Line
            type="linear"
            dataKey="current"
            name={currentLabel}
            stroke="var(--primary)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 5 }}
            {...CHART_SERIES_PROPS}
          />
        </LineChart>
      </ChartCanvas>

      {showLegend && (
        <ChartLegend
          items={[
            { label: currentLabel, color: "var(--primary)" },
            { label: referenceLabel, color: "var(--series-prior)", dashed: true },
          ]}
        />
      )}

      <ChartDataTable>
        <Table>
          <caption className="sr-only">{ariaLabel}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Monat</TableHead>
              <TableHead className="text-right">{currentLabel}</TableHead>
              <TableHead className="text-right">{referenceLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((point) => (
              <TableRow key={point.label}>
                <ChartRowHeader>{point.label}</ChartRowHeader>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(point.currentMoney)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(point.referenceMoney)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

// ============================================================================
// Anteile am Ganzen (Ring)
// ============================================================================

/** Ein Stueck des Rings; Anteile sind vorab gerechnet. */
export interface DonutSlice {
  key: string;
  label: string;
  money: Money;
  /** Anteil in Prozentpunkten. */
  share: DecimalInstance;
  /** Positionen hinter dem Stueck (Tooltip). */
  count: number;
  /** Grau statt Orange: „Sonstige", „ohne Angabe". */
  neutral?: boolean;
  /** Heller grau: „ohne Angabe". */
  faint?: boolean;
}

/**
 * Abstufungen der Akzentfarbe, groesster Anteil zuerst.
 *
 * **Eine Farbe statt einer bunten Palette:** Die App ist sonst einfarbig
 * (Vordergrund, Orange als Akzent, Grau fuer die Referenz). Die Stufen sind das
 * Orange mit abnehmender Deckkraft: Es scheint der jeweilige Grund durch, hell
 * wie dunkel bleibt der Ton derselbe (eine Mischung im OKLCH-Raum mit dem
 * Kachelgrund kippte ins Rosa).
 */
const DONUT_TONES = [100, 72, 50, 32] as const;

function donutColor(slice: DonutSlice, index: number): string {
  if (slice.faint) return "color-mix(in srgb, var(--series-prior) 45%, transparent)";
  if (slice.neutral) return "var(--series-prior)";
  const tone = DONUT_TONES[Math.min(index, DONUT_TONES.length - 1)];
  return `color-mix(in srgb, var(--primary) ${String(tone)}%, transparent)`;
}

interface DonutDatum {
  key: string;
  value: number;
  /** Recharts liest die Farbe eines Stuecks aus `fill` seines Datensatzes. */
  fill: string;
  slice: DonutSlice;
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DonutDatum }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { slice } = payload[0].payload;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{slice.label}</p>
      <p>
        {formatMoney(slice.money)} · {formatPercent(slice.share, 1)}
      </p>
      <p className="text-muted-foreground">
        {formatCountNumber(slice.count)} {slice.count === 1 ? "Position" : "Positionen"}
      </p>
    </ChartTooltipBox>
  );
}

/**
 * Ring „Anteil am Ganzen" mit Legende daneben (Bestand › Analyse).
 *
 * Die Legende traegt Name und Anteil als Text — Farbe allein unterscheidet
 * nichts (WCAG 1.4.1) —, der Ring ist fuer Hilfsmittel ein Bild mit
 * Beschreibung. Steht hier bei den uebrigen Diagrammen, damit Recharts in
 * **einem** nachgeladenen Teil bleibt.
 */
export function DonutChart({
  slices,
  ariaLabel,
}: {
  slices: readonly DonutSlice[];
  ariaLabel: string;
}) {
  const data: DonutDatum[] = slices.map((slice, index) => ({
    key: slice.key,
    value: slice.money.toChartNumber(),
    fill: donutColor(slice, index),
    slice,
  }));

  return (
    <div className="flex items-center gap-5 md:gap-4 2xl:gap-5">
      <div
        className="size-32 shrink-0 md:size-24 2xl:size-32"
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--card)"
              strokeWidth={2}
              {...CHART_SERIES_PROPS}
            />
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {data.map(({ key, slice, fill }) => (
          <li key={key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: fill }}
            />
            <span className="min-w-0 flex-1 leading-tight">{slice.label}</span>
            <span className="ml-2 shrink-0 font-semibold tabular-nums">
              {formatPercent(slice.share, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Dividenden-Schneeball (Bestand › Prognose)
// ============================================================================

/**
 * Ein Jahr des Schneeballs; Werte vorab gerechnet (features/securities/snowball.ts).
 * Vergangene Jahre tragen nur `actual`, die Hochrechnung `base`/`band`.
 */
export interface SnowballDatum {
  year: number;
  label: string;
  /** Erhalten: Nettodividende des Jahres ÷ 12; heute zusätzlich als Übergang. */
  actual: number | null;
  actualMoney: Money | null;
  base: number | null;
  /** Spanne vorsichtig–optimistisch (Recharts zeichnet ein Band aus `[von, bis]`). */
  band: [number, number] | null;
  projection: { base: Money; low: Money; high: Money } | null;
}

// Das Band ist seit 2.37.1 kräftiger und hat Ränder: Mit 16 % Deckkraft war
// es im dunklen Schema auf dem iPad kaum zu sehen.
const SNOWBALL_BAND_FILL = "color-mix(in srgb, var(--primary) 26%, transparent)";
const SNOWBALL_BAND_EDGE = "color-mix(in srgb, var(--primary) 55%, transparent)";
const SNOWBALL_DASH = "6 4";

function SnowballTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: SnowballDatum }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{row.year}</p>
      {row.projection ? (
        <>
          <p>{formatMoneyWhole(row.projection.base)} im Monat</p>
          <p className="text-muted-foreground">
            Spanne {formatMoneyWhole(row.projection.low)} –{" "}
            {formatMoneyWhole(row.projection.high)}
          </p>
        </>
      ) : (
        row.actualMoney && <p>Ø {formatMoneyWhole(row.actualMoney)} im Monat erhalten</p>
      )}
    </ChartTooltipBox>
  );
}

/**
 * Monatliche Nettodividende über die Jahre: links der bisherige Weg aus den
 * erhaltenen Dividenden als durchgezogene Linie (seit 2.32.0), ab heute die
 * Hochrechnung gestrichelt in derselben Farbe — ein Weg, der weitergeht. Die
 * Spanne der Szenarien liegt als helles Band dahinter, das Ziel als
 * gestrichelte Linie in Grau. Das Band zeigt die Unsicherheit, ohne dass drei
 * Linien um Aufmerksamkeit konkurrieren.
 */
export function SnowballChart({
  data,
  target,
  ariaLabel,
}: {
  data: readonly SnowballDatum[];
  /** Ziel pro Monat (Diagrammwert); `null` ohne Ziel. */
  target: number | null;
  ariaLabel: string;
}) {
  const hasHistory = data.some((row) => row.actualMoney !== null);
  const dash = (money: Money | null) => (money ? formatMoneyWhole(money) : "–");
  return (
    <div className="space-y-4">
      <ChartCanvas ariaLabel={ariaLabel}>
        <ComposedChart data={[...data]} margin={{ ...CHART_MARGIN, right: 16 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          {/* Höchstens acht Beschriftungen: 31 Jahre und mehr passen sonst auf
          keine Achse, zwölf Jahre brauchen nur jedes zweite. */}
          <XAxis
            dataKey="label"
            {...CHART_X_AXIS_PROPS}
            interval={Math.max(Math.ceil(data.length / 8) - 1, 0)}
          />
          <YAxis {...CHART_Y_AXIS_PROPS} />
          <Tooltip content={<SnowballTooltip />} cursor={CHART_LINE_CURSOR} />
          <Area
            type="monotone"
            dataKey="band"
            name="Spanne"
            stroke={SNOWBALL_BAND_EDGE}
            strokeWidth={1}
            fill={SNOWBALL_BAND_FILL}
            activeDot={false}
            {...CHART_SERIES_PROPS}
          />
          {target !== null && (
            <ReferenceLine
              y={target}
              stroke="var(--series-prior)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
            />
          )}
          {hasHistory && (
            <Line
              type="monotone"
              dataKey="actual"
              name="Bisher"
              stroke="var(--primary)"
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 5 }}
              {...CHART_SERIES_PROPS}
            />
          )}
          <Line
            type="monotone"
            dataKey="base"
            name="Hochrechnung"
            stroke="var(--primary)"
            strokeWidth={2.25}
            // Immer gestrichelt (seit 2.37.1): Bei „10 J." fehlt der bisherige
            // Weg, eine durchgezogene Linie las sich dann wie schon erreicht.
            strokeDasharray={SNOWBALL_DASH}
            dot={false}
            activeDot={{ r: 5 }}
            {...CHART_SERIES_PROPS}
          />
        </ComposedChart>
      </ChartCanvas>

      <ChartDataTable>
        <Table>
          <caption className="sr-only">{ariaLabel}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Jahr</TableHead>
              {hasHistory && <TableHead className="text-right">Erhalten</TableHead>}
              <TableHead className="text-right">Vorsichtig</TableHead>
              <TableHead className="text-right">Basis</TableHead>
              <TableHead className="text-right">Optimistisch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.year}>
                <ChartRowHeader>{row.year}</ChartRowHeader>
                {hasHistory && (
                  <TableCell className="text-right tabular-nums">
                    {dash(row.actualMoney)}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {dash(row.projection?.low ?? null)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dash(row.projection?.base ?? null)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dash(row.projection?.high ?? null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartDataTable>
    </div>
  );
}

// ============================================================================
// Ziel gegen Ist (Ziele)
// ============================================================================

/** Ein Zeitraum der Zielseite; Werte vorab gerechnet (lib/goals). */
export interface GoalBarDatum {
  key: string;
  label: string;
  /** Überschrift in Tooltip und Datentabelle, z. B. „Oktober 2026". */
  detail: string;
  actual: number;
  /** Noch erwarteter Rest im laufenden Zeitraum (gestreift auf dem Balken). */
  rest: number;
  target: number | null;
  actualMoney: Money;
  restMoney: Money | null;
  targetMoney: Money | null;
  /** Ergebnis in Worten, z. B. „Übertroffen um 251,00 €". */
  note?: string | undefined;
}

/** Wie weit die Zielmarke seitlich über den Balken ragt. */
const GOAL_TICK_OVERHANG = 3;

function GoalTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: GoalBarDatum }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{row.detail}</p>
      {row.targetMoney && <p>Ziel {formatMoney(row.targetMoney)}</p>}
      <p>Erhalten {formatMoney(row.actualMoney)}</p>
      {row.restMoney && (
        <p className="text-muted-foreground">Erwartet {formatMoney(row.restMoney)}</p>
      )}
      {row.note && <p className="text-muted-foreground">{row.note}</p>}
    </ChartTooltipBox>
  );
}

/** Das Ziel als Querstrich in Balkenbreite, etwas überstehend. */
function GoalTick({ x, y, width, payload }: BarShapeProps) {
  if ((payload as GoalBarDatum).target === null) return <g />;
  const left = x - GOAL_TICK_OVERHANG;
  const right = x + width + GOAL_TICK_OVERHANG;
  return (
    <line
      x1={left}
      x2={right}
      y1={y}
      y2={y}
      stroke="var(--foreground)"
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  );
}

/** Erhalten-Balken: gerundet nur, wenn kein Erwartet-Rest darauf liegt. */
function GoalActualBar(props: BarShapeProps) {
  return (
    <Rectangle
      {...props}
      radius={(props.payload as GoalBarDatum).rest > 0 ? 0 : CHART_BAR_RADIUS}
    />
  );
}

/**
 * Erhalten gegen Ziel je Zeitraum: Balken in der Akzentfarbe, im laufenden
 * Zeitraum gestreift fortgesetzt um das noch Erwartete (wie die Prognose am
 * Zielbalken der Übersicht), das Ziel als Querstrich. Ob ein Jahr sein Ziel
 * traf, sieht man so am Balkenende — ohne zweite Balkenreihe, die die Breite
 * halbiert. Tooltip statt Klick (Navigation nur über die Liste darunter), ohne
 * Legende: Was Balken, Streifen und Strich sind, nennt der Tooltip.
 */
export function GoalBarChart({
  data,
  ariaLabel,
  categoryHeader,
}: {
  data: GoalBarDatum[];
  ariaLabel: string;
  categoryHeader: string;
}) {
  // Je Diagramm eigen: Die Zielseite zeigt zwei davon.
  const restPattern = `goal-rest-${useId()}`;
  const hasRest = data.some((row) => row.rest > 0);
  return (
    <div className="space-y-4">
      <ChartCanvas ariaLabel={ariaLabel}>
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <defs>
            <pattern
              id={restPattern}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="2.5" height="5" fill="var(--series-prior)" />
            </pattern>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="label" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} />
          <Tooltip content={<GoalTooltip />} cursor={CHART_BAR_CURSOR} />
          <Bar
            dataKey="actual"
            name="Erhalten"
            stackId="goal"
            fill="var(--primary)"
            maxBarSize={CHART_MAX_BAR_SIZE}
            {...CHART_SERIES_PROPS}
            // Gerundet ist nur das obere Ende des Stapels.
            shape={GoalActualBar}
          />
          {hasRest && (
            <Bar
              dataKey="rest"
              name="Erwartet"
              stackId="goal"
              fill={`url(#${restPattern})`}
              radius={CHART_BAR_RADIUS}
              maxBarSize={CHART_MAX_BAR_SIZE}
              {...CHART_SERIES_PROPS}
            />
          )}
          {/* Auf einer eigenen, verborgenen Achse: So steht die Marke mittig
              über dem Balken statt als zweiter Balken daneben. */}
          <XAxis xAxisId="target" dataKey="label" hide />
          <Bar
            dataKey="target"
            name="Ziel"
            xAxisId="target"
            maxBarSize={CHART_MAX_BAR_SIZE}
            {...CHART_SERIES_PROPS}
            shape={GoalTick}
            activeBar={false}
          />
        </ComposedChart>
      </ChartCanvas>

      <ChartDataTable>
        <Table>
          <caption className="sr-only">{ariaLabel}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>{categoryHeader}</TableHead>
              <TableHead className="text-right">Ziel</TableHead>
              <TableHead className="text-right">Erhalten</TableHead>
              {hasRest && <TableHead className="text-right">Erwartet</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.key}>
                <ChartRowHeader>{row.detail}</ChartRowHeader>
                <TableCell className="text-right tabular-nums">
                  {row.targetMoney ? formatMoney(row.targetMoney) : "–"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.actualMoney)}
                </TableCell>
                {hasRest && (
                  <TableCell className="text-right tabular-nums">
                    {row.restMoney ? formatMoney(row.restMoney) : "–"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartDataTable>
    </div>
  );
}
