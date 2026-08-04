import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { monthNameDe } from "@/lib/statistics";
import type { CalendarViewMode } from "./viewMode";

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

      <div
        role="group"
        aria-label="Darstellung"
        className="flex items-center gap-1 rounded-md border border-border p-0.5"
      >
        {/* Die Liste steht links: Sie ist die Voreinstellung und die Ansicht,
            mit der die meisten Wege beginnen — das Monatsraster ist der
            Nebenweg und sitzt deshalb rechts daneben. */}
        <ModeButton
          active={mode === "agenda"}
          icon={List}
          label="Liste"
          onClick={() => {
            onModeChange("agenda");
          }}
        />
        <ModeButton
          active={mode === "month"}
          icon={CalendarDays}
          label="Monat"
          onClick={() => {
            onModeChange("month");
          }}
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof CalendarDays;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded px-2.5 text-sm font-medium outline-none",
        "pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}
