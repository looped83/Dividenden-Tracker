import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { monthNameDe } from "@/lib/statistics";
import type { CalendarViewMode } from "./viewMode";

const VIEW_OPTIONS: readonly SegmentOption<CalendarViewMode>[] = [
  { value: "agenda", label: "Liste", icon: List },
  { value: "month", label: "Monat", icon: CalendarDays },
];

/**
 * Bedienleiste des Kalenders: Monatsnavigation links, Wahl der Darstellung
 * rechts. Auf schmalen Geraeten untereinander, ab `sm` nebeneinander — damit
 * nichts umbricht und die Zielflaechen gross bleiben.
 */
export function CalendarToolbar({
  mode,
  onModeChange,
  year,
  month,
  onShiftMonth,
  onToday,
}: {
  mode: CalendarViewMode;
  onModeChange: (mode: CalendarViewMode) => void;
  year: number;
  month: number;
  onShiftMonth: (delta: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {mode === "month" ? (
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Vorheriger Monat"
            onClick={() => {
              onShiftMonth(-1);
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          {/* Der Monatswechsel aendert nur diesen Text; ohne die hoefliche
              Ansage bliebe er fuer Sprachausgaben unbemerkt. */}
          <h2
            aria-live="polite"
            className="min-w-[9rem] text-center text-base font-semibold tracking-tight"
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
          <Button variant="outline" size="sm" className="ml-1" onClick={onToday}>
            Heute
          </Button>
        </div>
      ) : (
        <span />
      )}

      {/* Die Liste steht links: Sie ist die Voreinstellung und die Ansicht,
          mit der die meisten Wege beginnen — das Monatsraster ist der
          Nebenweg und sitzt deshalb rechts daneben. */}
      <SegmentedControl
        label="Darstellung"
        options={VIEW_OPTIONS}
        value={mode}
        onChange={onModeChange}
      />
    </div>
  );
}
