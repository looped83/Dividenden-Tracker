/**
 * Auswertung der Depotstaende (docs/PORTFOLIO_IMPORT.md).
 *
 * Reine Funktionen ohne Bezug zur Oberflaeche und ohne Datenbankzugriff —
 * dasselbe Muster wie `lib/statistics`, damit sie sich einzeln pruefen lassen.
 *
 * Zwei Regeln gelten durchgaengig:
 *
 * * **Kein Wert von hier fliesst in Statistik oder Ziele.** Diese Zahlen sind
 *   Marktdaten und *erwartete* Ausschuettungen einer fremden Quelle; die
 *   Auswertungen der App rechnen ausschliesslich mit tatsaechlich erhaltenen
 *   Zahlungen (PRODUCT_SPEC.md Grundsatz 8).
 * * **Betraege verschiedener Waehrungen werden nicht addiert.** Das waere eine
 *   Umrechnung zu einem erfundenen Kurs. Die Summe meldet dann `mixedCurrency`,
 *   wie es der Dividendenkalender an derselben Stelle tut.
 */
import {
  EUR,
  Money,
  MoneyDecimal,
  toCurrencyCode,
  type DecimalInstance,
} from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Summe ueber Snapshots. `mixedCurrency` statt eines Betrags, sobald der Stand
 * mehrere Waehrungen enthaelt — dann gibt es keine ehrliche Gesamtzahl.
 */
export type SnapshotSum =
  | {
      kind: "amount";
      value: Money;
      /** Zeilen, die einen Wert beigetragen haben. */ counted: number;
    }
  | { kind: "mixedCurrency" }
  | { kind: "empty" };

export interface PortfolioTotals {
  asOf: string | null;
  /** Positionen im juengsten Stand. */
  positions: number;
  marketValue: SnapshotSum;
  buyinTotal: SnapshotSum;
  annualDividend: SnapshotSum;
  /**
   * Erwartete Jahresdividende geteilt durch Depotwert, in Prozentpunkten.
   *
   * Bewusst Summe durch Summe statt Mittelwert der Einzelrenditen: Der
   * Mittelwert gewichtet eine 40-€-Position genauso wie eine mit 26.000 € und
   * ergibt damit eine Zahl, die zu keinem Depot gehoert.
   */
  yieldPercent: DecimalInstance | null;
  /** Erwartete Jahresdividende geteilt durch Einstand, in Prozentpunkten. */
  yieldOnBuyinPercent: DecimalInstance | null;
}

const HUNDRED = new MoneyDecimal(100);

/** Der juengste Stichtag im Bestand; `null`, solange nichts importiert wurde. */
export function latestAsOf(snapshots: readonly SecuritySnapshot[]): string | null {
  let latest: string | null = null;
  for (const snapshot of snapshots) {
    if (latest === null || snapshot.as_of > latest) latest = snapshot.as_of;
  }
  return latest;
}

/** Die Zeilen eines Stichtags. */
export function snapshotsAt(
  snapshots: readonly SecuritySnapshot[],
  asOf: string | null,
): SecuritySnapshot[] {
  if (asOf === null) return [];
  return snapshots.filter((snapshot) => snapshot.as_of === asOf);
}

/**
 * Alle Staende eines Unternehmens, aeltester zuerst — die Reihenfolge, in der
 * ein Verlauf gezeichnet wird.
 */
export function historyOf(
  snapshots: readonly SecuritySnapshot[],
  securityId: string,
): SecuritySnapshot[] {
  return snapshots
    .filter((snapshot) => snapshot.security_id === securityId)
    .sort((a, b) => a.as_of.localeCompare(b.as_of));
}

/**
 * Der Stand eines Unternehmens am juengsten **eigenen** Stichtag, zusammen mit
 * der Auskunft, ob er noch aktuell ist.
 *
 * Die Datei ist der vollstaendige Depotstand ihres Tages. Fehlt ein Unternehmen
 * im juengsten Stand, obwohl es frueher darin stand, ist die Position verkauft.
 * Ohne diese Unterscheidung stuende auf ihrer Seite auf Dauer ein Bestand, den
 * es nicht mehr gibt — still falsch, und das ist die schlimmste Art falsch.
 */
export interface SnapshotStatus {
  snapshot: SecuritySnapshot | null;
  /** Der Stand stammt vom juengsten Stichtag: die Position wird noch gehalten. */
  current: boolean;
}

export function statusOf(
  snapshots: readonly SecuritySnapshot[],
  securityId: string,
  latest: string | null,
): SnapshotStatus {
  const history = historyOf(snapshots, securityId);
  const snapshot = history.at(-1) ?? null;
  return { snapshot, current: snapshot !== null && snapshot.as_of === latest };
}

/**
 * Summiert ein Betragsfeld ueber Snapshots. Zeilen ohne Wert zaehlen nicht mit
 * und werden auch nicht als 0 verrechnet — die Quelle laesst das Feld leer,
 * wenn sie nichts zu sagen hat, und `counted` macht die Luecke sichtbar.
 */
export function sumField(
  snapshots: readonly SecuritySnapshot[],
  pick: (snapshot: SecuritySnapshot) => string | null,
): SnapshotSum {
  const currencies = new Set(snapshots.map((snapshot) => snapshot.currency));
  if (currencies.size > 1) return { kind: "mixedCurrency" };

  // Ohne Zeilen gibt es keine Waehrung; die Basiswaehrung dient hier nur als
  // Platzhalter, denn das Ergebnis ist dann ohnehin `empty`.
  const currency = currencies.size === 0 ? EUR : toCurrencyCode([...currencies][0]);

  let total = Money.zero(currency);
  let counted = 0;
  for (const snapshot of snapshots) {
    const raw = pick(snapshot);
    if (raw === null) continue;
    total = total.add(Money.fromString(raw, currency));
    counted += 1;
  }
  if (counted === 0) return { kind: "empty" };
  return { kind: "amount", value: total, counted };
}

/** Prozentsatz `part / whole * 100`; `null`, wenn er nicht bestimmbar ist. */
function percentOf(part: SnapshotSum, whole: SnapshotSum): DecimalInstance | null {
  if (part.kind !== "amount" || whole.kind !== "amount") return null;
  const divisor = whole.value.toDecimal();
  if (divisor.isZero()) return null;
  return part.value.toDecimal().dividedBy(divisor).times(HUNDRED);
}

/** Kennzahlen des juengsten Depotstands. */
export function portfolioTotals(snapshots: readonly SecuritySnapshot[]): PortfolioTotals {
  const asOf = latestAsOf(snapshots);
  const current = snapshotsAt(snapshots, asOf);

  const marketValue = sumField(current, (snapshot) => snapshot.market_value);
  const buyinTotal = sumField(current, (snapshot) => snapshot.buyin_total);
  const annualDividend = sumField(current, (snapshot) => snapshot.annual_dividend_total);

  return {
    asOf,
    positions: current.length,
    marketValue,
    buyinTotal,
    annualDividend,
    yieldPercent: percentOf(annualDividend, marketValue),
    yieldOnBuyinPercent: percentOf(annualDividend, buyinTotal),
  };
}

/**
 * Ein Anteil der Quelle (0.029164) als Prozentpunkte (2.9164).
 *
 * Die Quelle liefert Renditen und Gewichte als Bruchteil; `formatPercent`
 * erwartet Prozentpunkte (CALCULATION_RULES.md §6).
 */
export function ratioToPercent(value: string | null): DecimalInstance | null {
  if (value === null) return null;
  return new MoneyDecimal(value).times(HUNDRED);
}
