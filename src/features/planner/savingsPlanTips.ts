import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { MODE_RULES } from "./purchase";
import { monthlyAmount, type SavingsPlan } from "./savingsPlans";

/**
 * Tipps zu den Sparplänen (CALCULATION_RULES.md §17, seit 2.26.0): Abgleich
 * der Pläne mit den Gewichtungen je Asset (§16). Nur was aus den eigenen
 * Daten folgt, keine allgemeinen Ratschläge; ohne Befund keine Tipps.
 */

/** So weit voraus meldet ein Plan, dass er seine Gewichtung erreicht. */
const TIP_HORIZON_MONTHS = 24;
/** Höchstens so viele Assets mit Platz, aber ohne Sparplan. */
const TIP_ROOM_MAX = 3;
/** Platz unter Mindestrate × 12 lohnt keinen Plan. */
const ROOM_MIN = MODE_RULES.sparplan.minimum * 12;

export type SavingsPlanTip =
  | {
      kind: "over";
      securityId: string;
      name: string;
      /** Anteil am Depot heute in Prozent. */
      percent: DecimalInstance;
      cap: number;
    }
  | { kind: "reaching"; securityId: string; name: string; months: number; cap: number }
  | { kind: "unweighted"; securityId: string; name: string }
  | {
      kind: "room";
      securityId: string;
      name: string;
      /** Euro bis zur Gewichtung beim heutigen Depotwert. */
      room: DecimalInstance;
      cap: number;
    };

const ZERO = new MoneyDecimal(0);

/**
 * - **Über / erreicht Gewichtung:** Ein aktiver Plan liegt schon über der
 *   Gewichtung seines Assets oder erreicht sie in höchstens 24 Monaten. Das
 *   Depot wächst dabei um alle aktiven Raten, Kurse bleiben gleich:
 *   n = ⌈(g·D − W) ÷ (r − g·R)⌉ mit Gewichtung g, Depotwert D, Marktwert W,
 *   Rate r des Assets und Summe R aller Raten.
 * - **Ohne Gewichtung:** aktiver Plan auf einem Asset ohne eigene Gewichtung.
 * - **Platz ohne Sparplan:** gehaltene Assets mit Gewichtung, aber ohne
 *   Plan (auch keinem pausierten) und nicht ausgeschlossen, mit mindestens
 *   12 × Mindestrate Platz; die drei mit dem meisten Platz.
 */
export function savingsPlanTips({
  plans,
  snapshots,
  caps,
  excluded,
  names,
}: {
  plans: readonly SavingsPlan[];
  snapshots: readonly SecuritySnapshot[];
  caps: ReadonlyMap<string, number>;
  excluded: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
}): SavingsPlanTip[] {
  const values = new Map<string, DecimalInstance>();
  for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
    if (row.market_value === null) continue;
    values.set(row.security_id, new MoneyDecimal(row.market_value));
  }
  const depot = [...values.values()].reduce((sum, value) => sum.plus(value), ZERO);
  if (!depot.greaterThan(0)) return [];

  const rates = new Map<string, DecimalInstance>();
  for (const plan of plans) {
    if (plan.paused) continue;
    rates.set(
      plan.securityId,
      (rates.get(plan.securityId) ?? ZERO).plus(monthlyAmount(plan)),
    );
  }
  const growth = [...rates.values()].reduce((sum, value) => sum.plus(value), ZERO);

  const weighting: SavingsPlanTip[] = [];
  const unweighted: SavingsPlanTip[] = [];
  for (const [securityId, rate] of rates) {
    const name = names.get(securityId);
    if (name === undefined) continue;
    const cap = caps.get(securityId);
    if (cap === undefined) {
      unweighted.push({ kind: "unweighted", securityId, name });
      continue;
    }
    const share = new MoneyDecimal(cap).dividedBy(100);
    const value = values.get(securityId) ?? ZERO;
    const missing = share.times(depot).minus(value);
    if (!missing.greaterThan(0)) {
      weighting.push({
        kind: "over",
        securityId,
        name,
        percent: value.dividedBy(depot).times(100),
        cap,
      });
      continue;
    }
    const pace = rate.minus(share.times(growth));
    if (!pace.greaterThan(0)) continue;
    const months = missing.dividedBy(pace).ceil().toNumber();
    if (months <= TIP_HORIZON_MONTHS)
      weighting.push({ kind: "reaching", securityId, name, months, cap });
  }

  const planned = new Set(plans.map((plan) => plan.securityId));
  const room = [...caps]
    .flatMap(([securityId, cap]): SavingsPlanTip[] => {
      const name = names.get(securityId);
      const value = values.get(securityId);
      if (name === undefined || !value?.greaterThan(0)) return [];
      if (planned.has(securityId) || excluded.has(securityId)) return [];
      const free = depot.times(cap).dividedBy(100).minus(value);
      return free.greaterThanOrEqualTo(ROOM_MIN)
        ? [{ kind: "room", securityId, name, room: free, cap }]
        : [];
    })
    .sort(
      (a, b) =>
        (a.kind === "room" && b.kind === "room" ? b.room.comparedTo(a.room) : 0) ||
        a.name.localeCompare(b.name, "de"),
    )
    .slice(0, TIP_ROOM_MAX);

  // Dringendes zuerst: über der Gewichtung, dann bald erreicht (früheste zuerst).
  const urgency = (tip: SavingsPlanTip) =>
    tip.kind === "over" ? -1 : tip.kind === "reaching" ? tip.months : 0;
  weighting.sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, "de"));
  unweighted.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return [...weighting, ...unweighted, ...room];
}
