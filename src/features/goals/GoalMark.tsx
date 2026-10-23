import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Das Zeichen eines Ziels: eine dunkle Symbolkachel, für Jahres- und
 * Monatsziel gleich.
 *
 * Bis 1.10 trugen Monatsziele ein eigenes Symbol auf grauer Kachel. Die Zielart
 * steht aber schon im Titel („Dividendenziel November 2026"); das zweite Zeichen
 * sagte nichts Neues und ließ das Monatsziel wie deaktiviert wirken. Die
 * Kachel misst 36 px — wie überall, wo ein Ziel steht.
 */
export function GoalMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background",
        className,
      )}
      // Der Titel steht daneben; das Symbol wiederholte ihn nur.
      aria-hidden
    >
      <CalendarRange className="size-5" />
    </span>
  );
}
