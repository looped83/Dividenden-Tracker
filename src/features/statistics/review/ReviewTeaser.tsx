import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { reviewHref } from "@/lib/statistics";

/**
 * Einstieg in den Jahresrueckblick: ein oranger Sockel unter der Leiste der
 * Nebenkennzahlen (`KpiHero` › `statsFooter`), ueber ihre ganze Breite.
 * Erscheint nur, wenn der Filter ein Jahr waehlt — und dann fuer genau dieses.
 *
 * Bewusst die einzige vollflaechig orange Flaeche der Seite: Orange heisst in
 * der App „hier passiert etwas" (UX_AND_DESIGN_SYSTEM.md §1), und der
 * Rueckblick ist genau das — ein Ereignis, kein weiterer Kennzahlkasten.
 * Schrift auf dem Akzent haelt in beiden Themes >= 4,5:1.
 */
export function ReviewTeaser({ year }: { year: number }) {
  return (
    <Link
      to={reviewHref(year)}
      aria-label={`Jahresrückblick ${String(year)} ansehen`}
      className="group flex items-center gap-3 rounded-b-2xl bg-primary px-4 py-3 text-primary-foreground outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:px-5 sm:py-2.5"
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-bold">Jahresrückblick {year}</span>
        <span className="hidden font-medium sm:inline">
          {" "}
          · Dein Dividendenjahr als Story
        </span>
      </span>
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
      >
        Story ansehen
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}
