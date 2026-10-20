import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { reviewHref } from "@/lib/statistics";

/**
 * Einstieg in den Jahresrueckblick auf der Statistik-Uebersicht. Erscheint
 * nur, wenn der Filter ein Jahr waehlt — und dann fuer genau dieses Jahr.
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
      className="group flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:gap-6 sm:p-7"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Jahresrückblick</span>
        <span className="mt-1 block text-[clamp(2.75rem,12vw,4rem)] font-bold leading-none tracking-[-0.04em] tabular-amount">
          {year}
        </span>
        <span className="mt-3 block text-[0.9375rem] font-medium">
          Dein Dividendenjahr als Story: Summe, Rekordmonat, Top-Zahler und mehr.
        </span>
      </span>
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none sm:size-14"
      >
        <ChevronRight className="size-6" />
      </span>
    </Link>
  );
}
