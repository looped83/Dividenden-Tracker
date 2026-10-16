import { Circle } from "lucide-react";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { YearOverYearComparison } from "@/features/payments/yearOverYear";

/**
 * Zeigt in einem Zeichen, wie die Zahlung zur Zahlung gleicher Reihenfolge im
 * Vorjahr steht: ▲ (mehr), ▼ (weniger), Punkt (gleich).
 *
 * Die Richtung steckt in der Form, nicht nur in der Farbe
 * (UX_AND_DESIGN_SYSTEM.md #1). Dasselbe Dreieck wie die Veraenderung
 * im Kopf der Uebersicht, eine Stufe kleiner: Es begleitet den Betrag, es
 * ueberstrahlt ihn nicht. Der volle Satz — Differenz, Betrag und Datum
 * der Vergleichszahlung — steht als Titel und fuer Screenreader daneben; ohne
 * ihn bliebe offen, worauf sich das Zeichen bezieht.
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
      className={cn(
        "inline-flex shrink-0 items-center",
        // Das Dreieck steht auf der Grundlinie des Betrags wie im Kopf der
        // Uebersicht; der Punkt bleibt mittig, auf der Grundlinie laese er
        // sich als Satzzeichen.
        direction === "same" && "self-center",
        className,
      )}
      title={label}
      data-direction={direction}
    >
      {direction === "up" && (
        <TrendTriangle direction="up" className="size-2.5 text-positive" />
      )}
      {direction === "down" && (
        <TrendTriangle direction="down" className="size-2.5 text-negative" />
      )}
      {direction === "same" && (
        <Circle className="size-1.5 fill-current text-muted-foreground" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
