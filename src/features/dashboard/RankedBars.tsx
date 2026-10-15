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
   * `series`: Balken in Diagrammfarbe (Statistik). `neutral`: schmaler Balken
   * in Vordergrundfarbe fuer die monochrome Uebersicht (seit 1.7.0).
   */
  tone?: "series" | "neutral";
}

/**
 * Horizontale Rangbalken fuer Top-Unternehmen (§9) und Depotverteilung (§10).
 * Reine Verteilung nach Nettodividende — keine Depotwerte, keine Performance,
 * keine Anlagebewertung. Die Balkenbreite ist rein visuell; alle angezeigten
 * Betraege und Anteile stammen aus lib/money bzw. lib/statistics.
 */
export function RankedBars({
  items,
  total,
  ariaLabel,
  tone = "series",
}: RankedBarsProps) {
  const neutral = tone === "neutral";
  const maxNet = items.reduce(
    (max, item) => (item.net.compareTo(max) > 0 ? item.net : max),
    items[0]?.net ?? total,
  );
  const maxNumber = maxNet.toChartNumber();

  return (
    <ul
      className={neutral ? "divide-y divide-border" : "space-y-3"}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const share = shareOfTotal(item.net, total);
        const widthPercent = barLength(item.net, maxNumber);
        return (
          <li key={item.key} className={cn(neutral && "py-3")}>
            <Link
              to={item.href}
              className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className={cn(
                  "flex items-baseline justify-between gap-2",
                  neutral ? "text-base" : "text-sm",
                )}
              >
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
                <span className={cn("shrink-0 tabular-nums", neutral && "font-semibold")}>
                  {formatMoney(item.net)}
                </span>
              </div>
              <div className={cn("flex items-center gap-2", neutral ? "mt-2" : "mt-1")}>
                <div
                  className={cn(
                    "flex-1 overflow-hidden rounded-full",
                    neutral ? "h-[3px] bg-border" : "h-2 bg-muted",
                  )}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      neutral ? "bg-foreground" : "bg-chart-1",
                    )}
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
