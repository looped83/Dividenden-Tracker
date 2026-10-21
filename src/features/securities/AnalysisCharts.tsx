import { ChevronDown } from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipBox } from "@/components/charts/chart";
import { CHART_SERIES_PROPS } from "@/components/charts/chartTheme";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { collapseSlices, OTHER_KEY, UNKNOWN_KEY, type AnalysisSlice } from "./analysis";

/**
 * Abstufungen der Akzentfarbe fuer die Ringstuecke, groesster Anteil zuerst.
 *
 * **Eine Farbe statt einer bunten Palette:** Die App ist sonst einfarbig
 * (Vordergrund, Orange als Akzent, Grau fuer die Referenz). Fuenf Buntfarben
 * neben schwarzen Rangbalken saehen nach einer anderen Anwendung aus. Die
 * Stufen sind das Orange mit abnehmender Deckkraft: Es scheint der jeweilige
 * Grund durch, hell wie dunkel bleibt der Ton derselbe. (Eine Mischung im
 * OKLCH-Raum mit dem Kachelgrund kippte ins Rosa.) „Sonstige" steht grau wie
 * jede Referenz, „ohne Angabe" heller grau.
 */
const RING_TONES = [100, 72, 50, 32] as const;

function ringColor(slice: AnalysisSlice, index: number): string {
  if (slice.key === OTHER_KEY) return "var(--series-prior)";
  if (slice.key === UNKNOWN_KEY)
    return "color-mix(in srgb, var(--series-prior) 45%, transparent)";
  const tone = RING_TONES[Math.min(index, RING_TONES.length - 1)];
  return `color-mix(in srgb, var(--primary) ${String(tone)}%, transparent)`;
}

function hasKnown(slices: readonly AnalysisSlice[]): boolean {
  return slices.some((slice) => slice.key !== UNKNOWN_KEY);
}

function NoData() {
  return <p className="py-6 text-sm text-muted-foreground">Keine Angaben vorhanden.</p>;
}

interface RingDatum {
  key: string;
  value: number;
  slice: AnalysisSlice;
  /** Recharts liest die Farbe eines Stuecks aus `fill` seines Datensatzes. */
  fill: string;
}

function RingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RingDatum }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { slice } = payload[0].payload;
  return (
    <ChartTooltipBox>
      <p className="font-medium">{slice.label}</p>
      <p>
        {formatMoney(slice.amount)} · {formatPercent(slice.share, 1)}
      </p>
      <p className="text-muted-foreground">
        {formatCountNoun(slice.positions, "Position", "Positionen")}
      </p>
    </ChartTooltipBox>
  );
}

/**
 * Ring fuer Aufteilungen mit **wenigen festen** Kategorien (Gattung, Waehrung,
 * Rhythmus): Er zeigt „Anteil am Ganzen" auf einen Blick. Die Legende daneben
 * traegt Name und Anteil als Text — Farbe allein unterscheidet nichts
 * (WCAG 1.4.1), und der Ring ist fuer Hilfsmittel ein Bild mit Beschreibung.
 */
export function AllocationRing({
  slices,
  ariaLabel,
}: {
  slices: readonly AnalysisSlice[];
  ariaLabel: string;
}) {
  if (!hasKnown(slices)) return <NoData />;

  const data: RingDatum[] = collapseSlices(slices).map((slice, index) => ({
    key: slice.key,
    value: slice.amount.toChartNumber(),
    slice,
    fill: ringColor(slice, index),
  }));

  return (
    <div className="flex items-center gap-5 md:gap-4 lg:gap-5">
      <div
        className="size-32 shrink-0 md:size-28 lg:size-32"
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
            <Tooltip content={<RingTooltip />} />
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
            <span className="ml-1 shrink-0 font-semibold tabular-nums">
              {formatPercent(slice.share, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarRow({
  slice,
  expandable = false,
}: {
  slice: AnalysisSlice;
  expandable?: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <span className="truncate">{slice.label}</span>
          {expandable && (
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          )}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatPercent(slice.share, 1)}
        </span>
      </div>
      <div className="mt-2 h-[3px] rounded-full bg-border" aria-hidden>
        <div
          className={
            slice.key === UNKNOWN_KEY
              ? "h-full rounded-full bg-series-prior"
              : "h-full rounded-full bg-foreground"
          }
          style={{ width: `${String(Math.max(1, slice.share.toNumber()))}%` }}
        />
      </div>
      <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
        {formatMoney(slice.amount)} ·{" "}
        {formatCountNoun(slice.positions, "Position", "Positionen")}
      </p>
    </>
  );
}

/**
 * Rangbalken fuer Aufteilungen mit **vielen offenen** Kategorien (Branche,
 * Region): dieselbe Form wie die Rangbalken der Uebersicht und Statistik —
 * Zeilen mit Haarlinie, schmaler Balken in Vordergrundfarbe.
 *
 * Traegt eine Zeile Unterteilungen (Laender einer Region), klappt sie als
 * natives `<details>` auf: tastaturbedienbar, ohne eigenen Zustand.
 */
export function AllocationBars({
  slices,
  ariaLabel,
}: {
  slices: readonly AnalysisSlice[];
  ariaLabel: string;
}) {
  if (!hasKnown(slices)) return <NoData />;

  return (
    <ul className="divide-y divide-border" aria-label={ariaLabel}>
      {slices.map((slice) => (
        <li key={slice.key || "unknown"} className="py-3">
          {slice.children.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <BarRow slice={slice} expandable />
              </summary>
              <ul className="mt-3 space-y-3 border-l border-border pl-4">
                {slice.children.map((child) => (
                  <li key={child.key} className="text-sm">
                    <BarRow slice={child} />
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <BarRow slice={slice} />
          )}
        </li>
      ))}
    </ul>
  );
}
