import * as React from "react";
import { Link } from "react-router";
import { Check, ChevronRight, Dumbbell } from "lucide-react";
import { challengeStatus, monthRef } from "@/lib/challenge";
import { isoDate, monthNameDe, type RefDate } from "@/lib/statistics/dates";
import { cn } from "@/lib/utils/cn";
import { useChallenge } from "./hooks";

/**
 * Der Dialog lädt erst beim ersten Tipp: Die Übersicht gehört zum
 * Start-Bundle, der Dialog (Radix) sonst nicht.
 */
const DayDialog = React.lazy(async () => ({
  default: (await import("./DayDialog")).DayDialog,
}));

/**
 * Schnell-Tipp auf der Übersicht, nur solange eine Challenge im laufenden
 * Monat läuft: eine schmale Zeile unter dem Kopf, keine Karte. Links der
 * Stand (führt zur Challenge), rechts „Heute eintragen" bzw. das Häkchen.
 * Bewusst unauffällig — die Übersicht bleibt bei den Dividenden.
 */
export function ChallengeQuickRow({ today }: { today: RefDate }) {
  const challenge = useChallenge().data ?? null;
  const [open, setOpen] = React.useState(false);
  if (!challenge) return null;
  const status = challengeStatus(challenge, today);
  if (status.phase !== "active") return null;

  const todayIso = isoDate(today.year, today.month, today.day);
  const doneToday = todayIso in challenge.days;
  const monthName = monthNameDe(monthRef(challenge.month).month);

  return (
    <div className="flex items-center justify-between gap-2 rounded-full bg-muted p-1 pl-1">
      <Link
        to="/challenge"
        className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-full px-3 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        aria-label={`Challenge ${monthName}: ${String(status.done)} von ${String(status.target)} Sporttagen`}
      >
        <Dumbbell className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">
          Challenge{" "}
          <span className="font-semibold tabular-nums">
            {status.done}/{status.target}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold outline-none pointer-coarse:min-h-11",
          "transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          doneToday
            ? "text-positive hover:bg-accent"
            : "bg-background text-foreground shadow-sm hover:bg-accent dark:bg-accent",
        )}
      >
        {doneToday ? (
          <>
            <Check className="size-4" aria-hidden /> Heute erledigt
          </>
        ) : (
          "Heute eintragen"
        )}
      </button>
      {open && (
        <React.Suspense fallback={null}>
          <DayDialog
            challenge={challenge}
            day={todayIso}
            onClose={() => {
              setOpen(false);
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
}
