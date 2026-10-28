import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { monthlyAmount, type SavingsPlan } from "./savingsPlans";

/**
 * Tipps zu den Sparplänen (CALCULATION_RULES.md §17, seit 2.26.0): Abgleich
 * der Pläne und der automatischen Reinvestition (seit 2.38.0) mit den
 * Gewichtungen je Asset (§16). Nur was aus den eigenen Daten folgt, keine
 * allgemeinen Ratschläge; ohne Befund keine Tipps.
 */

/** So weit voraus meldet ein Plan, dass er seine Gewichtung erreicht. */
const TIP_HORIZON_MONTHS = 24;
/** Höchstens so viele Assets mit Platz, aber ohne Sparplan. */
const TIP_ROOM_MAX = 3;
/** Platz unter 300 € (25-€-Rate × 12) lohnt keinen Plan. */
const ROOM_MIN = 300;

export type SavingsPlanTip =
  | {
      kind: "over";
      securityId: string;
      name: string;
      /** Anteil am Depot heute in Prozent. */
      percent: DecimalInstance;
      cap: number;
      /** Die Dividenden kaufen zusätzlich nach. */
      reinvested: boolean;
    }
  | {
      /** Über der Gewichtung ohne Sparplan, aber mit Reinvestition. */
      kind: "reinvestOver";
      securityId: string;
      name: string;
      percent: DecimalInstance;
      cap: number;
    }
  | {
      /** Unter der Gewichtung, Dividenden werden ausgezahlt. */
      kind: "reinvestRoom";
      securityId: string;
      name: string;
      room: DecimalInstance;
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
 * - **Reinvestition** (seit 2.38.0): Ein reinvestiertes Asset ohne aktiven
 *   Plan liegt auf oder über seiner Gewichtung → ausschalten. Ein gehaltenes
 *   Asset mit Gewichtung, Dividende und mindestens 12 × Mindestrate Platz
 *   reinvestiert nicht und ist nicht ausgeschlossen → einschalten; die drei
 *   mit dem meisten Platz.
 */
export function savingsPlanTips({
  plans,
  snapshots,
  caps,
  excluded,
  names,
  reinvested = new Set(),
}: {
  plans: readonly SavingsPlan[];
  snapshots: readonly SecuritySnapshot[];
  caps: ReadonlyMap<string, number>;
  excluded: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
  reinvested?: ReadonlySet<string>;
}): SavingsPlanTip[] {
  const values = new Map<string, DecimalInstance>();
  const paying = new Set<string>();
  for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
    if (row.market_value === null) continue;
    values.set(row.security_id, new MoneyDecimal(row.market_value));
    if (row.annual_dividend_total !== null && Number(row.annual_dividend_total) > 0)
      paying.add(row.security_id);
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
        reinvested: reinvested.has(securityId),
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

  // Reinvestition: nur Assets ohne aktiven Plan — mit Plan sagt es der
  // Tipp zum Plan (über der Gewichtung, „reinvestiert“).
  const reinvestTips: SavingsPlanTip[] = [];
  const reinvestRoom: SavingsPlanTip[] = [];
  for (const [securityId, cap] of caps) {
    const name = names.get(securityId);
    const value = values.get(securityId);
    if (name === undefined || !value?.greaterThan(0) || rates.has(securityId)) continue;
    const free = depot.times(cap).dividedBy(100).minus(value);
    if (reinvested.has(securityId)) {
      if (!free.greaterThan(0))
        reinvestTips.push({
          kind: "reinvestOver",
          securityId,
          name,
          percent: value.dividedBy(depot).times(100),
          cap,
        });
    } else if (
      paying.has(securityId) &&
      !excluded.has(securityId) &&
      free.greaterThanOrEqualTo(ROOM_MIN)
    ) {
      reinvestRoom.push({ kind: "reinvestRoom", securityId, name, room: free, cap });
    }
  }
  reinvestTips.sort((a, b) => a.name.localeCompare(b.name, "de"));
  reinvestRoom.sort(
    (a, b) =>
      (a.kind === "reinvestRoom" && b.kind === "reinvestRoom"
        ? b.room.comparedTo(a.room)
        : 0) || a.name.localeCompare(b.name, "de"),
  );

  // Dringendes zuerst: über der Gewichtung, dann bald erreicht (früheste zuerst).
  const urgency = (tip: SavingsPlanTip) =>
    tip.kind === "over" ? -1 : tip.kind === "reaching" ? tip.months : 0;
  weighting.sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, "de"));
  unweighted.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return [
    ...weighting,
    ...reinvestTips,
    ...unweighted,
    ...room,
    ...reinvestRoom.slice(0, TIP_ROOM_MAX),
  ];
}
