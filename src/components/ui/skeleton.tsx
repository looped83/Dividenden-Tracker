import { cn } from "@/lib/utils/cn";

/**
 * Platzhalterflaeche eines Ladezustands.
 *
 * Ein Geruest in der Form des kommenden Inhalts statt der Zeile „Wird geladen
 * …": Die Seite behaelt ihre Hoehe, nichts springt beim Erscheinen der Daten,
 * und der Wechsel wirkt kuerzer als er ist. `prefers-reduced-motion` schaltet
 * das Pulsieren ab (UX_AND_DESIGN_SYSTEM.md §1) — die Flaeche bleibt, die
 * Bewegung geht.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * Geruest fuer eine Liste oder Tabelle: ein Rahmen mit Kopfzeile und
 * Platzhalterzeilen — dieselbe Flaeche, die gleich die echten Zeilen tragen.
 *
 * Die Ansage bleibt hoeflich und kurz: `aria-busy` sagt Hilfsmitteln, dass hier
 * gearbeitet wird, der versteckte Text nennt den Gegenstand. Die Platzhalter
 * selbst sind fuer Screenreader unsichtbar — sie haben keinen Inhalt.
 */
export function SkeletonRows({
  rows = 5,
  label,
  className,
}: {
  rows?: number;
  /** Was geladen wird, z. B. „Dividendeneingänge". */
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label} werden geladen …</span>
      <div className="flex h-11 items-center gap-4 border-b border-border bg-muted/50 px-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
