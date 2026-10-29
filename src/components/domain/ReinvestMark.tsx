import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Kleines Zeichen für „Dividende wird automatisch reinvestiert" (seit 2.50.0).
 *
 * Ein Spross statt Kreispfeilen: ↻ (`Repeat`) steht für „Sparplan läuft" —
 * zwei Kreispfeile mit zwei Bedeutungen ließen sich nicht auseinanderhalten.
 * Der Spross sagt, was die Reinvestition tut: Aus der Dividende wachsen neue
 * Anteile. Gedämpft wie das Sparplan-Zeichen, damit es den Namen nicht übertönt.
 */
export function ReinvestMark({ className }: { className?: string }) {
  return (
    <span
      title="Wird reinvestiert"
      className={cn("inline-flex shrink-0 text-muted-foreground", className)}
    >
      <Sprout className="size-3.5" aria-hidden />
      <span className="sr-only">Wird reinvestiert</span>
    </span>
  );
}
