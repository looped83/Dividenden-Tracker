import { Link } from "react-router";
import { Flag } from "lucide-react";
import { EUR, Money, MoneyDecimal, formatMoneyWhole } from "@/lib/money";
import { formatMonths } from "./targetTime";

/**
 * Ziel-Zeit (seit 2.32.0, CALCULATION_RULES.md §14.4): wie viel früher das
 * Schneeball-Ziel erreicht ist. Steht im Kopf von Nachkauf und Sparplänen und
 * führt zum Schneeball, wo die Annahmen dahinter stehen.
 */
export function TargetGain({
  months,
  target,
  lead,
}: {
  /** Vorgezogene Monate, mindestens einer. */
  months: number;
  /** Ziel pro Monat in Euro. */
  target: number;
  /** Satzanfang, etwa „Dieser Kauf bringt dich". */
  lead: string;
}) {
  const goal = formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(target), EUR));
  return (
    <Link
      to="/planer/schneeball"
      className="inline-flex min-h-9 items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Flag aria-hidden className="size-4 shrink-0 text-primary" />
      <span>
        {lead} <span className="font-semibold">{formatMonths(months)} früher</span> an
        dein Ziel von {goal} im Monat
      </span>
    </Link>
  );
}
