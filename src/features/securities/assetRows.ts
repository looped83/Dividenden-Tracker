import { Money, toCurrencyCode, type DecimalInstance } from "@/lib/money";
import { latestAsOf, ratioToPercent, snapshotsAt } from "@/features/securities/snapshots";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Die Position eines Assets im **juengsten** Depotstand
 * (docs/PORTFOLIO_IMPORT.md), auf die Zahlen reduziert, die eine Zeile der
 * Assetliste traegt.
 *
 * Bewusst nur der juengste Stand: Der Export beschreibt das ganze Depot, ein
 * darin fehlendes Papier ist also verkauft. Ein aelterer Stand in einer
 * Uebersicht waere ein Bestand, den es nicht mehr gibt — still falsch, und das
 * ist die schlimmste Art falsch. Die Detailseite zeigt ihn weiterhin, dort
 * ausdruecklich als „letzter bekannter Bestand" ausgewiesen.
 */
export interface AssetPosition {
  /** Stichtag des Stands — er gilt fuer jede Zahl darin. */
  asOf: string;
  marketValue: Money | null;
  /** Anteil am Depot in Prozentpunkten, laut Quelle. */
  allocationPercent: DecimalInstance | null;
  gain: Money | null;
  gainPercent: DecimalInstance | null;
  annualDividend: Money | null;
  dividendYield: DecimalInstance | null;
}

/** Eine Zeile der Assetliste: Stammdaten, Depotkonto und Position in einem. */
export interface AssetRow {
  security: Security;
  /** Name des Standard-Depotkontos; `null`, wenn keines gesetzt ist. */
  depotName: string | null;
  /** `null`, solange kein Depotstand vorliegt oder die Position verkauft ist. */
  position: AssetPosition | null;
}

function positionOf(snapshot: SecuritySnapshot): AssetPosition {
  const currency = toCurrencyCode(snapshot.currency);
  const money = (value: string | null) =>
    value === null ? null : Money.fromString(value, currency);

  return {
    asOf: snapshot.as_of,
    marketValue: money(snapshot.market_value),
    allocationPercent: ratioToPercent(snapshot.allocation),
    gain: money(snapshot.gain_absolute),
    gainPercent: ratioToPercent(snapshot.gain_relative),
    annualDividend: money(snapshot.annual_dividend_total),
    dividendYield: ratioToPercent(snapshot.dividend_yield),
  };
}

/**
 * Verbindet Assets, Depotkonten und den juengsten Depotstand zu den Zeilen der
 * Assetliste.
 *
 * Rein und ohne Bezug zur Oberflaeche — dieselbe Aufteilung wie bei
 * `snapshots.ts` und `sortSecurities.ts`, damit sich die Zuordnung einzeln
 * pruefen laesst.
 *
 * @param depotNameOf Name des Standard-Depotkontos; `null`, wenn keines gesetzt
 *                    ist oder das Konto nicht (mehr) existiert.
 */
export function buildAssetRows(
  securities: readonly Security[],
  snapshots: readonly SecuritySnapshot[],
  depotNameOf: (depotId: string) => string | null,
): AssetRow[] {
  const current = snapshotsAt(snapshots, latestAsOf(snapshots));
  const positionBySecurity = new Map<string, AssetPosition>();
  for (const snapshot of current) {
    positionBySecurity.set(snapshot.security_id, positionOf(snapshot));
  }

  return securities.map((security) => ({
    security,
    depotName: security.default_depot_id ? depotNameOf(security.default_depot_id) : null,
    position: positionBySecurity.get(security.id) ?? null,
  }));
}

/** Traegt mindestens eine Zeile eine Position? Steuert die Spalten der Liste. */
export function hasPositions(rows: readonly AssetRow[]): boolean {
  return rows.some((row) => row.position !== null);
}
