import { Link } from "react-router";
import { Flag } from "lucide-react";
import { EUR, Money, MoneyDecimal, formatMoneyWhole } from "@/lib/money";
import { formatMonths } from "./targetTime";

/**
 * Ziel-Zeit (seit 2.32.0, CALCULATION_RULES.md §14.4): wie viel früher das
 * Schneeball-Ziel erreicht ist. Steht im Kopf von Nachkauf und Sparplänen und
 * führt zum Schneeball, wo die Annahmen dahinter stehen. Seit 2.33.0 eine
 * Zeile: Wer vorzieht, sagt schon die Überschrift darüber, das Ziel der Link.
 * Seit 2.61.0 auch rückwärts: Ein Tausch, der Dividende kostet, schiebt das
 * Ziel hinaus („später").
 */
export function TargetGain({
  months,
  target,
}: {
  /** Vorgezogene Monate (negativ: hinausgeschoben), mindestens ein Tag. */
  months: number;
  /** Ziel pro Monat in Euro. */
  target: number;
}) {
  const goal = formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(target), EUR));
  return (
    <Link
      to="/planer/schneeball"
      title={`Ziel: ${goal} im Monat`}
      className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Flag aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="truncate">
        <span className="font-semibold">
          {formatMonths(Math.abs(months))} {months < 0 ? "später" : "früher"}
        </span>{" "}
        am Ziel
        <span className="sr-only"> von {goal} im Monat</span>
      </span>
    </Link>
  );
}
