import { Circle } from "lucide-react";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { monthNameDe } from "@/lib/statistics";
import type { MonthChange } from "@/features/payments/monthGroups";
import type { YearOverYearComparison } from "@/features/payments/yearOverYear";

/**
 * Zeigt, wie die Zahlung zur Zahlung desselben Monats im Vorjahr steht:
 * ▲ (mehr), ▼ (weniger), Punkt (gleich). Seit 2.53.0 steht die Veraenderung
 * in Prozent daneben — ob +2 % oder +40 %, sagte das Dreieck allein nicht.
 * Verglichen werden Betraege, nicht Dividenden je Aktie (siehe
 * `compareToPreviousYear`); der Titel nennt deshalb die Vergleichszahlung.
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
  const { direction, previousAmount, previousDate, difference, percent } = comparison;
  const reference = `Vorjahr: ${formatMoney(previousAmount)} am ${formatCalendarDate(previousDate)}`;
  const percentText =
    direction !== "same" && percent !== null ? formatPercent(percent.abs()) : null;
  const label =
    direction === "same"
      ? `Unverändert — ${reference}`
      : `${formatMoney(difference)}${percentText ? ` (${direction === "up" ? "+" : "−"}${percentText})` : ""} gegenüber dem Vorjahr — ${reference}`;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 text-xs font-medium tabular-amount",
        direction === "up" && "text-positive",
        direction === "down" && "text-negative",
        // Das Dreieck steht auf der Grundlinie des Betrags wie im Kopf der
        // Uebersicht; der Punkt bleibt mittig, auf der Grundlinie laese er
        // sich als Satzzeichen.
        direction === "same" && "self-center",
        className,
      )}
      title={label}
      data-direction={direction}
    >
      {direction === "up" && <TrendTriangle direction="up" className="size-2.5" />}
      {direction === "down" && <TrendTriangle direction="down" className="size-2.5" />}
      {direction === "same" && (
        <Circle className="size-1.5 fill-current text-muted-foreground" aria-hidden />
      )}
      {percentText && <span aria-hidden>{percentText}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Monatssumme gegenueber demselben Monat im Vorjahr (seit 2.53.0) — im Kopf
 * jedes Monats, in derselben Form wie der Vergleich je Zahlung. Der Titel
 * nennt die Vorjahressumme; im laufenden Monat auch, bis zu welchem Tag
 * verglichen wird.
 */
export function MonthChangeIndicator({
  change,
  year,
  month,
}: {
  change: MonthChange;
  year: number;
  month: number;
}) {
  const { direction, percent, reference, cutoffDay } = change;
  const until =
    cutoffDay === null
      ? ""
      : ` (bis ${String(cutoffDay).padStart(2, "0")}.${String(month).padStart(2, "0")}.)`;
  const percentText = formatPercent(percent.abs());
  const label =
    direction === "same"
      ? `Unverändert gegenüber ${monthNameDe(month)} ${String(year - 1)}${until}`
      : `${direction === "up" ? "+" : "−"}${percentText} gegenüber ${monthNameDe(month)} ${String(year - 1)}${until}: ${formatMoney(reference)}`;
  if (direction === "same") return <span className="sr-only">{label}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 tabular-amount",
        direction === "up" ? "text-positive" : "text-negative",
      )}
      title={label}
      data-direction={direction}
    >
      <TrendTriangle direction={direction} className="size-2.5" />
      <span aria-hidden>{percentText}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
