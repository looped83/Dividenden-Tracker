import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthNameDe } from "@/lib/statistics";

/**
 * Monatsnavigation des Monatsrasters. Die Wahl der Darstellung steht seit
 * 1.9.0 im Seitenkopf (wie die Jahresauswahl der Uebersicht); hier bleibt nur,
 * was allein zum Raster gehoert.
 */
export function CalendarToolbar({
  year,
  month,
  onShiftMonth,
  onToday,
}: {
  year: number;
  month: number;
  onShiftMonth: (delta: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Vorheriger Monat"
        className="-ml-3"
        onClick={() => {
          onShiftMonth(-1);
        }}
      >
        <ChevronLeft aria-hidden />
      </Button>
      {/* Der Monatswechsel aendert nur diesen Text; ohne die hoefliche Ansage
          bliebe er fuer Sprachausgaben unbemerkt. Groesse wie die
          Ueberschrift eines Abschnitts. */}
      <h2
        aria-live="polite"
        className="min-w-[9.5rem] text-center text-[1.1875rem] font-bold leading-tight tracking-[-0.015em]"
      >
        {monthNameDe(month)} {year}
      </h2>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Nächster Monat"
        onClick={() => {
          onShiftMonth(1);
        }}
      >
        <ChevronRight aria-hidden />
      </Button>
      <Button variant="outline" size="sm" className="ml-auto" onClick={onToday}>
        Heute
      </Button>
    </div>
  );
}
