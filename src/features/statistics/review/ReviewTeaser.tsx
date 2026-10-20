import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { reviewHref } from "@/lib/statistics";

/**
 * Einstieg in den Jahresrueckblick auf der Statistik-Uebersicht: das neueste
 * Jahr als Karte, fruehere Jahre als Pillen darunter. Ein eigener Reiter
 * passte auf dem Telefon nicht mehr neben die vier vorhandenen.
 */
export function ReviewTeaser({ years }: { years: readonly number[] }) {
  const latest = years.at(0);
  const earlier = years.slice(1);
  if (latest === undefined) return null;

  return (
    <section
      aria-label="Jahresrückblick"
      className="rounded-2xl border border-border bg-card p-4 sm:p-6"
    >
      <Link
        to={reviewHref(latest)}
        className="group -m-2 flex items-center gap-4 rounded-xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-primary">
            Jahresrückblick
          </span>
          <span className="mt-1 block text-xl font-bold tracking-[-0.02em]">
            Dein Dividendenjahr {latest}
          </span>
          <span className="mt-1 block text-[0.9375rem] text-muted-foreground">
            Summe, Rekordmonat, Top-Zahler und mehr als Story.
          </span>
        </span>
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        >
          <ChevronRight className="size-5" />
        </span>
      </Link>
      {earlier.length > 0 && (
        <nav aria-label="Frühere Rückblicke" className="mt-4 border-t border-border pt-4">
          <ul className="flex flex-wrap gap-2">
            {earlier.map((year) => (
              <li key={year}>
                <Link
                  to={reviewHref(year)}
                  aria-label={`Rückblick ${String(year)}`}
                  className="inline-flex h-9 items-center rounded-full border border-input px-3.5 text-sm font-medium tabular-amount outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                >
                  {year}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
