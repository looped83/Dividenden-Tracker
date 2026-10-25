import { z } from "zod";
import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import { compareGerman } from "@/lib/utils/compareText";
import { isoDate, lastDayOfMonth, type RefDate } from "@/lib/statistics/dates";
import type { TwelveMonthForecast } from "@/features/securities/forecast";
import type { PurchaseCandidate } from "./purchase";

/**
 * Sparpläne (CALCULATION_RULES.md §17): von Hand gepflegte Stammdaten am
 * Profil (Migration 0042). Gerechnet wird beim Anzeigen; gespeichert sind nur
 * die Pläne selbst.
 */

export type SavingsInterval = "monthly" | "weekly";

export interface SavingsPlan {
  id: string;
  securityId: string;
  depotId: string | null;
  /** Rate je Ausführung. */
  amount: Money;
  interval: SavingsInterval;
  /** Eine (beliebige) Ausführung als Anker, ISO-Datum; `null` ohne Angabe. */
  nextDate: string | null;
  paused: boolean;
}

/**
 * Die Spalte fasst höchstens 8 KB (0042); ein Plan braucht rund 210 Byte, ab
 * etwa 37 Plänen schlüge das Speichern fehl. 30 lässt Luft für große Raten.
 */
export const SAVINGS_PLANS_MAX = 30;
export const SAVINGS_PLAN_AMOUNT_MAX = 100_000;

export const INTERVAL_LABEL: Record<SavingsInterval, string> = {
  monthly: "monatlich",
  weekly: "wöchentlich",
};

const storedPlan = z.object({
  id: z.string().min(1).max(16),
  securityId: z.guid(),
  depotId: z.guid().nullable().catch(null),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((value) => {
      const amount = new MoneyDecimal(value);
      return amount.gt(0) && amount.lte(SAVINGS_PLAN_AMOUNT_MAX);
    }),
  interval: z.enum(["monthly", "weekly"]),
  nextDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  paused: z.boolean().catch(false),
});

/**
 * Liest die gespeicherte Liste. Ein ungültiger Plan (Handeingriff, ältere
 * Fassung) fällt weg, statt die ganze Liste zu verwerfen.
 */
export function parseSavingsPlans(raw: unknown): SavingsPlan[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = storedPlan.safeParse(entry);
    if (!parsed.success) return [];
    return [{ ...parsed.data, amount: Money.fromString(parsed.data.amount, EUR) }];
  });
}

/**
 * Eine leere Liste wird `null` (wie bei den Fixkosten): Die Testbrücke bindet
 * ein leeres Array als Postgres-Array, das die Formprüfung abweist.
 */
export function toStoredSavingsPlans(plans: readonly SavingsPlan[]) {
  if (plans.length === 0) return null;
  return plans.map((plan) => ({
    id: plan.id,
    securityId: plan.securityId,
    depotId: plan.depotId,
    amount: plan.amount.toStringValue(),
    interval: plan.interval,
    nextDate: plan.nextDate,
    paused: plan.paused,
  }));
}

const WEEKS_PER_MONTH = new MoneyDecimal(52).dividedBy(12);

/** Betrag im Monat: monatlich die Rate, wöchentlich Rate × 52 ÷ 12. */
export function monthlyAmount(plan: SavingsPlan): DecimalInstance {
  const rate = plan.amount.toDecimal();
  return plan.interval === "weekly" ? rate.times(WEEKS_PER_MONTH) : rate;
}

function addMonths(iso: string, count: number, day: number): string {
  const [year, month] = iso.split("-").map(Number);
  const offset = month - 1 + count;
  const nextYear = year + Math.floor(offset / 12);
  const nextMonth = (offset % 12) + 1;
  return isoDate(nextYear, nextMonth, Math.min(day, lastDayOfMonth(nextYear, nextMonth)));
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Nächste Ausführung ab heute: der gespeicherte Anker, im Rhythmus
 * fortgeschrieben, bis er nicht mehr vor heute liegt. Monatlich bleibt der
 * Tag des Ankers (am Monatsende gekürzt).
 */
export function nextExecution(plan: SavingsPlan, today: RefDate): string | null {
  if (plan.nextDate === null) return null;
  const todayIso = isoDate(today.year, today.month, today.day);
  let next = plan.nextDate;
  if (plan.interval === "weekly") {
    if (next < todayIso) {
      const behind = Math.round(
        (Date.parse(`${todayIso}T12:00:00Z`) - Date.parse(`${next}T12:00:00Z`)) /
          86_400_000,
      );
      next = addDays(next, Math.ceil(behind / 7) * 7);
    }
    return next;
  }
  const day = Number.parseInt(plan.nextDate.slice(8, 10), 10);
  for (let step = 1; next < todayIso; step += 1)
    next = addMonths(plan.nextDate, step, day);
  return next;
}

export interface SavingsPlanRow {
  plan: SavingsPlan;
  monthly: Money;
  /** Mehr netto im Jahr nach zwölf Monaten; `null`, wenn das Asset nicht ausschüttet. */
  annual: Money | null;
  months: readonly number[];
}

export interface SavingsPlanOverview {
  rows: SavingsPlanRow[];
  paused: SavingsPlanRow[];
  monthly: Money;
  yearly: Money;
  annual: Money;
  /** Ertrag der Pläne: annual ÷ yearly × 100; `null` ohne aktive Pläne. */
  yieldPercent: DecimalInstance | null;
  before: Money[];
  after: Money[];
}

/**
 * Was die Pläne bringen: zwölf Raten je aktivem Plan, verzinst mit dem Ertrag
 * je Euro und den Zahlmonaten der Prognose (dieselben Kandidaten wie im
 * Nachkauf, §16). Pläne auf Assets ohne Ausschüttung zählen in der Summe, aber
 * nicht in der Dividende. Alphabetisch nach Name des Assets (seit 2.21.1).
 */
export function savingsPlanOverview(
  forecast: TwelveMonthForecast,
  candidates: readonly PurchaseCandidate[],
  plans: readonly SavingsPlan[],
  names: ReadonlyMap<string, string>,
): SavingsPlanOverview {
  const byId = new Map(candidates.map((candidate) => [candidate.securityId, candidate]));
  const before = forecast.months.map((month) => month.total.toDecimal());
  const after = [...before];
  let monthly = new MoneyDecimal(0);
  let annual = new MoneyDecimal(0);

  const toRow = (plan: SavingsPlan, active: boolean): SavingsPlanRow => {
    const perMonth = monthlyAmount(plan);
    const candidate = byId.get(plan.securityId);
    let yearly: DecimalInstance | null = null;
    if (candidate) {
      const perPayout = candidate.perPayoutPerEuro.times(perMonth.times(12));
      yearly = perPayout.times(candidate.months.length);
      if (active) {
        // Hochlauf: Im k-ten Monat sind erst k von zwölf Raten angelegt.
        forecast.months.forEach((month, index) => {
          if (candidate.months.includes(month.month))
            after[index] = after[index].plus(perPayout.times(index + 1).dividedBy(12));
        });
        annual = annual.plus(yearly);
      }
    }
    if (active) monthly = monthly.plus(perMonth);
    return {
      plan,
      monthly: Money.fromDecimal(perMonth, EUR),
      annual: yearly === null ? null : Money.fromDecimal(yearly, EUR),
      months: candidate?.months ?? [],
    };
  };

  const byName = (a: SavingsPlanRow, b: SavingsPlanRow) =>
    compareGerman(names.get(a.plan.securityId) ?? "", names.get(b.plan.securityId) ?? "");
  const rows = plans
    .filter((plan) => !plan.paused)
    .map((plan) => toRow(plan, true))
    .sort(byName);
  const paused = plans
    .filter((plan) => plan.paused)
    .map((plan) => toRow(plan, false))
    .sort(byName);

  const yearly = monthly.times(12);
  return {
    rows,
    paused,
    monthly: Money.fromDecimal(monthly, EUR),
    yearly: Money.fromDecimal(yearly, EUR),
    annual: Money.fromDecimal(annual, EUR),
    yieldPercent: yearly.greaterThan(0) ? annual.dividedBy(yearly).times(100) : null,
    before: before.map((value) => Money.fromDecimal(value, EUR)),
    after: after.map((value) => Money.fromDecimal(value, EUR)),
  };
}

/** Summe der aktiven Pläne im Monat (für Nachkauf und Schneeball). */
export function activeMonthlyTotal(plans: readonly SavingsPlan[]): DecimalInstance {
  return plans
    .filter((plan) => !plan.paused)
    .reduce((sum, plan) => sum.plus(monthlyAmount(plan)), new MoneyDecimal(0));
}
