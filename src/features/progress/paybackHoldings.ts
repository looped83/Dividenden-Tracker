import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { EUR, Money } from "@/lib/money";
import type { PaybackHolding } from "@/lib/progress";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Gehaltene Positionen mit Einstand aus dem jüngsten Depotstand. Zeilen ohne
 * Einstand oder in fremder Währung fallen weg: Gegen Euro-Dividenden ließen
 * sie sich nur zu einem erfundenen Kurs rechnen.
 */
export function paybackHoldings(
  snapshots: readonly SecuritySnapshot[],
  securities: readonly Security[],
): PaybackHolding[] {
  const names = new Map(securities.map((security) => [security.id, security.name]));
  return snapshotsAt(snapshots, latestAsOf(snapshots)).flatMap((row) =>
    row.buyin_total !== null && row.currency === EUR
      ? [
          {
            securityId: row.security_id,
            name: names.get(row.security_id) ?? "Unbekanntes Asset",
            buyin: Money.fromString(row.buyin_total, EUR),
          },
        ]
      : [],
  );
}
