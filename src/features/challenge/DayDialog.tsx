import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIVITIES, toggleActivity, type Challenge } from "@/lib/challenge";
import { cn } from "@/lib/utils/cn";
import { useSaveChallenge } from "./hooks";
import { formatWeekdayDate } from "./format";

/**
 * Ein Tag der Challenge: Aktivitäten als Pillen. Jeder Tipp speichert sofort —
 * eine Pille gewählt heißt Sporttag, keine heißt offen. Minuten gibt es nicht:
 * Die Stunde ist Teil der Regel, nicht der Eingabe.
 */
export function DayDialog({
  challenge,
  day,
  onClose,
}: {
  challenge: Challenge;
  /** ISO-Datum; `null` schließt den Dialog. */
  day: string | null;
  onClose: () => void;
}) {
  const { mutate: save, error } = useSaveChallenge();
  const selected = day ? (challenge.days[day] ?? []) : [];

  return (
    <Dialog
      open={day !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Kein vorfokussiertes Kreuz oder erste Pille (wie beim Ex-Tag-Dialog).
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{day ? formatWeekdayDate(day) : ""}</DialogTitle>
          <DialogDescription>
            Was hast du gemacht? Ab einer Stunde Bewegung zählt der Tag.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Aktivitäten">
          {ACTIVITIES.map((activity) => {
            const active = selected.includes(activity.id);
            return (
              <button
                key={activity.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (day) save(toggleActivity(challenge, day, activity.id));
                }}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none",
                  "transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {active && <Check className="size-4" aria-hidden />}
                {activity.label}
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-sm text-negative">
            Speichern fehlgeschlagen. Bitte versuch es noch einmal.
          </p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
