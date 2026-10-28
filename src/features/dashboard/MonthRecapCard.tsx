import * as React from "react";
import { Repeat, X } from "lucide-react";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent } from "@/lib/money";
import { computeGoalProgress } from "@/lib/goals";
import {
  comparePeriods,
  monthNameDe,
  monthRecap,
  type AnalyticsPayment,
  type RefDate,
} from "@/lib/statistics";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { cn } from "@/lib/utils/cn";
import { useGoals } from "@/features/goals/hooks";
import { statusLabel, statusTone } from "@/features/goals/format";
import { paymentsListHref, splitComparison, type EntityInfo } from "./format";

/**
 * Wer den Abschluss weggeklickt hat, sieht ihn fuer diesen Monat nicht wieder —
 * eine Ansichtsvorliebe dieses Geraets wie die Diagrammsicht.
 */
const DISMISS_KEY = "dividend-tracker:month-recap-dismissed";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function storeDismissed(key: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, key);
  } catch {
    // Ohne Speicher bleibt die Karte bis zum Neuladen ausgeblendet.
  }
}

/**
 * Monatsabschluss (CALCULATION_RULES.md §11.13): in den ersten sieben Tagen
 * eines Monats eine gedämpfte Fläche über dem Kopf mit dem Ergebnis des
 * Vormonats — erhalten samt Vorjahresmonat, stärkster Zahler, Monatsziel.
 * Bewusst nur diese drei Zahlen: Alles Weitere steht in der Statistik, und
 * im Januar übernimmt der Jahresrückblick.
 */
export function MonthRecapCard({
  payments,
  securities,
  reinvestSince,
  today,
}: {
  payments: AnalyticsPayment[];
  securities: ReadonlyMap<string, EntityInfo>;
  /** Seit wann je Asset automatisch reinvestiert wird (§11.14). */
  reinvestSince: ReadonlyMap<string, string | null>;
  today: RefDate;
}) {
  const goals = useGoals().data;
  const [dismissed, setDismissed] = React.useState(readDismissed);

  const recap = React.useMemo(
    () =>
      monthRecap(
        payments,
        today,
        (id) => securities.get(id)?.name ?? id,
        (id) => reinvestSince.get(id),
      ),
    [payments, today, securities, reinvestSince],
  );

  const goal = React.useMemo(() => {
    if (!recap) return null;
    const found = goals?.find(
      (g) => g.goalType === "monthly" && g.year === recap.year && g.month === recap.month,
    );
    return found ? computeGoalProgress(found, payments, today) : null;
  }, [goals, recap, payments, today]);

  if (!recap) return null;
  const key = `${String(recap.year)}-${String(recap.month)}`;
  // Ein leerer Monat ohne Ziel hat nichts abzuschließen.
  if (dismissed === key || (recap.count === 0 && goal === null)) return null;

  const monthName = monthNameDe(recap.month);
  const result = comparePeriods(recap.net, recap.priorNet);
  const stats: KpiStat[] = [
    {
      label: "Erhalten",
      value: <AmountText amount={recap.net} />,
      caption:
        result.kind === "percent" || result.kind === "new"
          ? splitComparison(result, "ggü. Vj.").caption
          : undefined,
      to: paymentsListHref({ year: recap.year, month: recap.month }),
      drillLabel: `Dividenden ${monthName} ${String(recap.year)} anzeigen`,
    },
  ];
  if (recap.top) {
    const name = securities.get(recap.top.securityId)?.name ?? "Unbekannt";
    stats.push({
      label: "Top-Zahler",
      value: <AmountText amount={recap.top.net} />,
      caption: <span className="block truncate">{name}</span>,
      to: paymentsListHref({
        year: recap.year,
        month: recap.month,
        securityId: recap.top.securityId,
      }),
      drillLabel: `Dividenden von ${name} im ${monthName} anzeigen`,
    });
  }
  if (goal) {
    const tone = statusTone(goal.status);
    stats.push({
      label: "Monatsziel",
      value: (
        <span
          className={cn(
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
          )}
        >
          {statusLabel(goal.status)}
        </span>
      ),
      // Eine Nachkommastelle: 99,7 % hiesse gerundet „100 %" neben „Nicht erreicht".
      caption: `${formatPercent(goal.percent, 1)} vom Ziel`,
      to: `/ziele/${goal.goal.id}`,
      drillLabel: `Monatsziel ${monthName}: ${statusLabel(goal.status)}`,
    });
  } else {
    stats.push({
      label: "Dividenden",
      value: formatCountNumber(recap.count),
      caption: formatCountNoun(recap.assets, "Asset", "Assets"),
    });
  }

  return (
    <section aria-labelledby="month-recap-title" className="rounded-2xl bg-muted p-1.5">
      <div className="flex items-center justify-between gap-2 pl-2 sm:pl-4">
        <h2 id="month-recap-title" className="text-[0.9375rem] font-semibold">
          Monatsabschluss {monthName}
        </h2>
        <button
          type="button"
          onClick={() => {
            setDismissed(key);
            storeDismissed(key);
          }}
          aria-label={`Monatsabschluss ${monthName} ausblenden`}
          className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <KpiStats className="rounded-none bg-transparent p-0" stats={stats} />
      {/* Unter den drei Zahlen, nicht als vierte: Es ist ein Teil von
          „Erhalten", kein eigenes Ergebnis. */}
      {recap.reinvested && (
        <p className="flex items-center gap-1.5 px-2 pb-2 text-sm text-muted-foreground sm:px-4">
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          <span>
            Davon <AmountText amount={recap.reinvested.net} /> automatisch reinvestiert
          </span>
        </p>
      )}
    </section>
  );
}
