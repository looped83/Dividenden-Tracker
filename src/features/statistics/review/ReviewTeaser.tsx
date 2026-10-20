import type * as React from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { TrendTriangle } from "@/components/ui/trend-triangle";
import { formatMoney, formatPercent } from "@/lib/money";
import { reviewHref, type AnnualReview } from "@/lib/statistics";

/**
 * Einstieg in den Jahresrueckblick auf der Statistik-Uebersicht. Erscheint
 * nur, wenn der Filter ein Jahr waehlt — und dann fuer genau dieses Jahr.
 *
 * Bewusst die einzige vollflaechig orange Flaeche der Seite: Orange heisst in
 * der App „hier passiert etwas" (UX_AND_DESIGN_SYSTEM.md §1), und der
 * Rueckblick ist genau das — ein Ereignis, kein weiterer Kennzahlkasten.
 * Schrift auf dem Akzent haelt in beiden Themes >= 4,5:1.
 */
function Teaser({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs font-medium">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1 truncate text-base font-bold tabular-amount">
        {children}
      </span>
    </span>
  );
}

/**
 * Ab `md` fuellt eine Vorschau die Mitte: drei Kennzahlen, die nicht schon im
 * Kennzahlkopf darueber stehen. Die Nettosumme fehlt deshalb bewusst. Auf dem
 * Telefon bleibt das Banner eine Zeile.
 */
export function ReviewTeaser({
  review,
  topPayer,
}: {
  review: AnnualReview;
  topPayer: string | null;
}) {
  const { year, change } = review;
  return (
    <Link
      to={reviewHref(year)}
      aria-label={`Jahresrückblick ${String(year)} ansehen`}
      className="group flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:px-5 md:gap-6"
    >
      <span className="min-w-0 flex-1 md:flex-none">
        <span className="block truncate text-base font-bold tracking-[-0.01em] sm:text-lg">
          Jahresrückblick {year}
        </span>
        <span className="block truncate text-sm font-medium">
          Dein Dividendenjahr als Story
        </span>
      </span>

      <span
        aria-hidden
        className="hidden min-w-0 flex-1 grid-cols-3 gap-6 border-l border-primary-foreground/30 pl-6 md:grid"
      >
        <Teaser label="Top-Zahler">
          <span className="truncate">{topPayer ?? "—"}</span>
        </Teaser>
        <Teaser label="Pro Tag">{formatMoney(review.perDay)}</Teaser>
        <Teaser label={`ggü. ${String(year - 1)}`}>
          {change.kind === "percent" ? (
            <>
              {!change.percent.isZero() && (
                <TrendTriangle direction={change.percent.isNegative() ? "down" : "up"} />
              )}
              {formatPercent(change.percent.abs())}
            </>
          ) : change.kind === "new" ? (
            "neu"
          ) : (
            "—"
          )}
        </Teaser>
      </span>

      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none md:hidden"
      >
        <ChevronRight className="size-5" />
      </span>
      <span
        aria-hidden
        className="hidden h-9 shrink-0 items-center gap-1 rounded-full bg-primary-foreground pl-4 pr-3 text-sm font-semibold text-primary md:inline-flex"
      >
        Story ansehen
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}
