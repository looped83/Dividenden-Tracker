import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatPercent, type Money } from "@/lib/money";
import { shareOfTotal } from "@/lib/statistics";
import { cn } from "@/lib/utils/cn";
import { barLength } from "./format";

export interface RankedBarItem {
  key: string;
  name: string;
  archived: boolean;
  net: Money;
  href: string;
}

interface RankedBarsProps {
  items: RankedBarItem[];
  /** Gesamtsumme des Zeitraums fuer die Anteilsberechnung (§9/§10). */
  total: Money;
  /** Bezeichnung fuer den Screenreader (z. B. „Top-Unternehmen"). */
  ariaLabel: string;
  /**
   * Zweispaltig ab `lg` (Statistik): Ueber die volle Breite des Desktops wurden
   * die Balken einen Meter lang und Name und Betrag standen weit auseinander.
   * Auf der Uebersicht steht die Liste ohnehin in der schmalen rechten Spalte.
   */
  columns?: boolean;
}

/**
 * Horizontale Rangbalken fuer Top-Unternehmen (§9) und Depotverteilung (§10).
 * Reine Verteilung nach Nettodividende — keine Depotwerte, keine Performance,
 * keine Anlagebewertung. Die Balkenbreite ist rein visuell; alle angezeigten
 * Betraege und Anteile stammen aus lib/money bzw. lib/statistics.
 *
 * Schmale Balken in Vordergrundfarbe, Zeilen durch Haarlinien getrennt — auf
 * der Uebersicht und in der Statistik dieselbe Form (seit 1.9.0; vorher trug
 * die Statistik breite Balken in Diagrammblau).
 */
export function RankedBars({
  items,
  total,
  ariaLabel,
  columns = false,
}: RankedBarsProps) {
  const maxNet = items.reduce(
    (max, item) => (item.net.compareTo(max) > 0 ? item.net : max),
    items[0]?.net ?? total,
  );
  const maxNumber = maxNet.toChartNumber();

  return (
    <ul
      className={cn(
        "divide-y divide-border",
        // Jede Zeile endet mit einer Linie, damit beide Spalten gleich enden.
        columns &&
          "lg:columns-2 lg:gap-x-12 lg:[&>li]:break-inside-avoid lg:[&>li]:border-b",
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const share = shareOfTotal(item.net, total);
        const widthPercent = barLength(item.net, maxNumber);
        return (
          <li key={item.key} className="py-3">
            <Link
              to={item.href}
              className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate font-medium group-hover:underline"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  {item.archived && (
                    <Badge variant="neutral" className="shrink-0">
                      Archiviert
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(item.net)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${String(widthPercent)}%` }}
                  />
                </div>
                {/* Nur der Anteil: Die Zahl der Zahlungen sagt ueber die
                    Verteilung nichts aus. Wo sie zaehlt, steht sie in der
                    Tabelle darunter („Zahlungen"). Breite reicht fuer
                    „100,0 %" in einer Zeile. */}
                <span className="w-14 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums">
                  {share ? formatPercent(share) : "—"}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
