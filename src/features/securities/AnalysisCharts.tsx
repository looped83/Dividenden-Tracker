import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";
import { useOpenKeys } from "@/lib/hooks/useOpenKeys";
import { formatMoney, formatPercent } from "@/lib/money";
import { DonutChart } from "@/features/statistics/components/charts";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  collapseSlices,
  NO_COUNTRY_KEY,
  OTHER_KEY,
  UNKNOWN_KEY,
  type AnalysisHolding,
  type AnalysisSlice,
} from "./analysis";
import { barIndex } from "@/lib/utils/barIndex";

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
              className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-open:rotate-180"
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
            slice.key === UNKNOWN_KEY || slice.key === NO_COUNTRY_KEY
              ? "bar-grow h-full rounded-full bg-series-prior"
              : "bar-grow h-full rounded-full bg-foreground"
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

/** Die Positionen hinter einem Anteil: Name fuehrt zur Detailseite des Assets. */
function HoldingList({ holdings }: { holdings: readonly AnalysisHolding[] }) {
  const backState = useBackState();
  return (
    <ul className="mt-3 space-y-2 border-l border-border pl-4 text-sm">
      {holdings.map((holding) => (
        <li
          key={holding.securityId}
          className="flex items-baseline justify-between gap-3"
        >
          <Link
            to={`/depot/${holding.securityId}`}
            state={backState}
            className="min-w-0 truncate rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {holding.name}
          </Link>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatMoney(holding.amount)} ·{" "}
            <span className="font-medium text-foreground">
              {formatPercent(holding.share, 1)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Rangbalken fuer Aufteilungen mit **vielen offenen** Kategorien (Branche,
 * Land): dieselbe Form wie die Rangbalken der Uebersicht und Statistik —
 * Zeilen mit Haarlinie, schmaler Balken in Vordergrundfarbe.
 *
 * Ein Klick auf die Zeile klappt die Positionen dahinter auf — als natives
 * `<details>`: tastaturbedienbar. Was offen ist, steht in der Adresse
 * (`param`, seit 2.17.1): Der Weg zurueck von einem Asset findet es wieder.
 */
export function AllocationBars({
  slices,
  ariaLabel,
  param,
}: {
  slices: readonly AnalysisSlice[];
  ariaLabel: string;
  /** Suchparameter der offenen Zeilen, je Diagramm ein eigener. */
  param: string;
}) {
  const { isOpen, setOpen } = useOpenKeys(param);
  if (!hasKnown(slices)) return <NoData />;

  return (
    <ul aria-label={ariaLabel}>
      {slices.map((slice, index) => {
        const key = slice.key || "unknown";
        return (
          <li key={key} className="py-3" style={barIndex(index)}>
            <details
              className="group"
              open={isOpen(key)}
              onToggle={(event) => {
                const { open } = event.currentTarget;
                if (open !== isOpen(key)) setOpen(key, open);
              }}
            >
              <summary className="cursor-pointer list-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <BarRow slice={slice} expandable />
              </summary>
              <HoldingList holdings={slice.holdings} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}
