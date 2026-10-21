import { formatMoney, formatPercent } from "@/lib/money";
import { DonutChart } from "@/features/statistics/components/charts";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { collapseSlices, OTHER_KEY, UNKNOWN_KEY, type AnalysisSlice } from "./analysis";

function hasKnown(slices: readonly AnalysisSlice[]): boolean {
  return slices.some((slice) => slice.key !== UNKNOWN_KEY);
}

function NoData() {
  return <p className="py-6 text-sm text-muted-foreground">Keine Angaben vorhanden.</p>;
}

/**
 * Ring fuer Aufteilungen mit **wenigen festen** Kategorien (Asset-Typ, Waehrung,
 * Rhythmus): hoechstens fuenf Stuecke, der Rest wird „Sonstige" — mehr
 * Abstufungen einer Farbe kann niemand auseinanderhalten.
 */
export function AllocationRing({
  slices,
  ariaLabel,
}: {
  slices: readonly AnalysisSlice[];
  ariaLabel: string;
}) {
  if (!hasKnown(slices)) return <NoData />;
  return (
    <DonutChart
      ariaLabel={ariaLabel}
      slices={collapseSlices(slices).map((slice) => ({
        key: slice.key,
        label: slice.label,
        money: slice.amount,
        share: slice.share,
        count: slice.positions,
        neutral: slice.key === UNKNOWN_KEY || slice.key === OTHER_KEY,
        faint: slice.key === UNKNOWN_KEY,
      }))}
    />
  );
}

function BarRow({ slice }: { slice: AnalysisSlice }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{slice.label}</span>
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
 * Land): dieselbe Form wie die Rangbalken der Uebersicht und Statistik —
 * Zeilen mit Haarlinie, schmaler Balken in Vordergrundfarbe.
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
          <BarRow slice={slice} />
        </li>
      ))}
    </ul>
  );
}
