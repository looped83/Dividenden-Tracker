import { cn } from "@/lib/utils/cn";

/**
 * Richtung einer Veränderung als gefülltes Dreieck: ▲ mehr, ▼ weniger.
 * Ein Zeichen für die ganze App (seit 1.22.0) — vorher standen schräge
 * Pfeile neben dem Dreieck der Übersicht. Die Farbe erbt es vom Text
 * (`text-positive`/`text-negative`), die Größe skaliert mit der Schrift.
 * Die Richtung steckt damit in Form und Farbe (UX_AND_DESIGN_SYSTEM.md §1);
 * den Wortlaut für Hilfsmittel trägt der Aufrufer.
 */
export function TrendTriangle({
  direction,
  className,
}: {
  direction: "up" | "down";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 10 8"
      aria-hidden
      className={cn(
        "size-[0.6em] shrink-0 fill-current",
        direction === "down" && "rotate-180",
        className,
      )}
    >
      <path d="M5 0 10 8H0z" />
    </svg>
  );
}
