import { ArrowDown, ArrowUp, Circle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/features/payments/paymentDisplay";
import type { YearOverYearComparison } from "@/features/payments/yearOverYear";

/**
 * Zeigt in einem Zeichen, wie die Zahlung zur Zahlung gleicher Reihenfolge im
 * Vorjahr steht: Pfeil hoch (mehr), Pfeil runter (weniger), Punkt (gleich).
 *
 * Die Richtung steckt in der Form, nicht nur in der Farbe
 * (UX_AND_DESIGN_SYSTEM.md #1). Der volle Satz — Differenz, Betrag und Datum
 * der Vergleichszahlung — steht als Titel und fuer Screenreader daneben; ohne
 * ihn bliebe offen, worauf sich der Pfeil bezieht.
 */
export function YearOverYearIndicator({
  comparison,
  className,
}: {
  comparison: YearOverYearComparison;
  className?: string;
}) {
  const { direction, previousAmount, previousDate, difference } = comparison;
  const reference = `Vorjahr: ${formatMoney(previousAmount)} am ${formatDate(previousDate)}`;
  const label =
    direction === "same"
      ? `Unverändert — ${reference}`
      : `${formatMoney(difference)} gegenüber dem Vorjahr — ${reference}`;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title={label}
      data-direction={direction}
    >
      {direction === "up" && (
        <ArrowUp className="size-4 text-positive" strokeWidth={2.5} aria-hidden />
      )}
      {direction === "down" && (
        <ArrowDown className="size-4 text-negative" strokeWidth={2.5} aria-hidden />
      )}
      {direction === "same" && (
        <Circle className="size-2 fill-current text-muted-foreground" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
