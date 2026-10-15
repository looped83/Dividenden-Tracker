import { ArrowDownRight, ArrowUpRight, Circle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { YearOverYearComparison } from "@/features/payments/yearOverYear";

/**
 * Zeigt in einem Zeichen, wie die Zahlung zur Zahlung gleicher Reihenfolge im
 * Vorjahr steht: Pfeil hoch (mehr), Pfeil runter (weniger), Punkt (gleich).
 *
 * Die Richtung steckt in der Form, nicht nur in der Farbe
 * (UX_AND_DESIGN_SYSTEM.md #1). Derselbe schraege Pfeil wie die Veraenderung
 * im Kopf der Uebersicht, eine Stufe kleiner: Er begleitet den Betrag, er
 * ueberstrahlt ihn nicht. Der volle Satz — Differenz, Betrag und Datum
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
  const reference = `Vorjahr: ${formatMoney(previousAmount)} am ${formatCalendarDate(previousDate)}`;
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
        <ArrowUpRight className="size-3.5 text-positive" strokeWidth={2.5} aria-hidden />
      )}
      {direction === "down" && (
        <ArrowDownRight
          className="size-3.5 text-negative"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
      {direction === "same" && (
        <Circle className="size-1.5 fill-current text-muted-foreground" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
