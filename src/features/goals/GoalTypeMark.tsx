import { CalendarDays, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Goal } from "@/lib/goals";
import { goalTypeBadgeLabel } from "./format";

/**
 * Das Erkennungszeichen der Zielart: Symbolkachel plus Beschriftung samt
 * Zeitraum.
 *
 * Jahres- und Monatsziele sahen zuvor gleich aus — beide eine Karte mit Titel,
 * Balken und Betraegen; die Art stand nur als graue Kleinschrift darunter. Drei
 * Merkmale trennen sie jetzt: Symbol (Zeitspanne gegen einzelne Tage), Farbe
 * der Kachel und Beschriftung. Farbe und Form tragen die Unterscheidung nie
 * allein (WCAG 1.4.1), und die Kachel misst 36 px — bei 14 px waren die beiden
 * Kalendersymbole nicht auseinanderzuhalten.
 *
 * Bewusst dasselbe Zeichen auf Uebersicht, Zielseite und Detailseite: Ein Ziel
 * sieht ueberall gleich aus, sonst muss man dreimal neu lesen lernen.
 */
export function GoalTypeMark({
  goal,
  className,
}: {
  goal: Pick<Goal, "goalType" | "year" | "month">;
  className?: string;
}) {
  const isMonthly = goal.goalType === "monthly";
  const Icon = isMonthly ? CalendarDays : CalendarRange;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        isMonthly ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        className,
      )}
      // Die Beschriftung steht daneben; das Symbol wiederholte sie nur.
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

/** Die Beschriftung zur Kachel, z. B. „Jahresziel 2026". */
export function GoalTypeLabel({
  goal,
}: {
  goal: Pick<Goal, "goalType" | "year" | "month">;
}) {
  return <p className="text-xs text-muted-foreground">{goalTypeBadgeLabel(goal)}</p>;
}
