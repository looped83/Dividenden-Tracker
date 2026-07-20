import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatPercent, type Money } from "@/lib/money";
import { shareOfTotal } from "@/lib/statistics";

export interface RankedBarItem {
  key: string;
  name: string;
  archived: boolean;
  net: Money;
  count: number;
  href: string;
}

interface RankedBarsProps {
  items: RankedBarItem[];
  /** Gesamtsumme des Zeitraums fuer die Anteilsberechnung (§9/§10). */
  total: Money;
  /** Bezeichnung fuer den Screenreader (z. B. „Top-Unternehmen"). */
  ariaLabel: string;
}

/**
 * Horizontale Rangbalken fuer Top-Unternehmen (§9) und Depotverteilung (§10).
 * Reine Verteilung nach Nettodividende — keine Depotwerte, keine Performance,
 * keine Anlagebewertung. Die Balkenbreite ist rein visuell; alle angezeigten
 * Betraege und Anteile stammen aus lib/money bzw. lib/statistics.
 */
export function RankedBars({ items, total, ariaLabel }: RankedBarsProps) {
  const maxNet = items.reduce(
    (max, item) => (item.net.compareTo(max) > 0 ? item.net : max),
    items[0]?.net ?? total,
  );
  const maxNumber = maxNet.toChartNumber();

  return (
    <ul className="space-y-3" aria-label={ariaLabel}>
      {items.map((item) => {
        const share = shareOfTotal(item.net, total);
        const widthPercent =
          maxNumber > 0 ? Math.max(2, (item.net.toChartNumber() / maxNumber) * 100) : 0;
        return (
          <li key={item.key}>
            <Link
              to={item.href}
              className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
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
                <span className="shrink-0 tabular-nums">{formatMoney(item.net)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{
                      width: `${String(widthPercent)}%`,
                      backgroundColor: "var(--chart-1)",
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {share ? formatPercent(share) : "—"} ·{" "}
                  {item.count === 1 ? "1 Zahlung" : `${String(item.count)} Zahlungen`}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
