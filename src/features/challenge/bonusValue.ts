import * as React from "react";
import { useGoalProgressPayments } from "@/features/goals/hooks";
import { netRatio } from "@/features/securities/forecast";
import { useForecastSettings } from "@/features/securities/forecastSettings";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";
import {
  depotAssumptions,
  projectSnowball,
  reinvestedIds,
  type DepotAssumptions,
  type SnowballSettings,
} from "@/features/securities/snowball";
import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import { isoFromRef, type RefDate } from "@/lib/statistics";

/** Jahre der Hochrechnung: kurz und lang. */
export const BONUS_YEARS = [10, 20] as const;

export interface BonusValue {
  /** Nettodividende im Jahr, die der Betrag heute bringt. */
  today: DecimalInstance;
  /** Nettodividende im Jahr nach 10 und 20 Jahren (heutige Kaufkraft). */
  later: readonly { years: number; annual: DecimalInstance }[];
  yieldPercent: DecimalInstance;
  growthPercent: DecimalInstance;
  /** Inflation der Annahmen; über 0 sind die späteren Werte heutige Kaufkraft. */
  inflationPercent: number;
}

/**
 * Was ein investierter Betrag an Dividende bringt (CALCULATION_RULES.md
 * §18.1): derselbe Schneeball wie im Planer — Rendite, Wachstum,
 * Reinvestition und Inflation aus den Annahmen bzw. dem Depot —, nur ohne
 * Sparrate und mit dem Betrag als einzigem Bestand.
 */
export function bonusValue({
  amount,
  depot,
  settings,
  ratio,
  today,
}: {
  amount: number;
  depot: DepotAssumptions;
  settings: SnowballSettings;
  ratio: DecimalInstance | null;
  today: RefDate;
}): BonusValue {
  const yieldPercent =
    settings.yieldPercent === null
      ? depot.yieldPercent
      : new MoneyDecimal(settings.yieldPercent);
  const result = projectSnowball({
    depot: {
      ...depot,
      annualGross: new MoneyDecimal(amount).times(yieldPercent).dividedBy(100),
    },
    settings: { ...settings, monthlySavings: 0, targetMonthly: 0 },
    netRatio: ratio,
    startYear: today.year,
    startMonth: today.month,
    years: BONUS_YEARS[BONUS_YEARS.length - 1],
  });
  return {
    today: result.today.times(12),
    later: BONUS_YEARS.map((years) => ({
      years,
      annual: (result.points[years]?.base ?? result.today).times(12),
    })),
    yieldPercent: result.yieldPercent,
    growthPercent: result.growthPercent,
    inflationPercent: settings.inflationPercent,
  };
}

/** {@link bonusValue} mit den Daten der App; ohne Depotstand `null`. */
export function useBonusValue(amount: number, today: RefDate): BonusValue | null {
  const snapshots = useSecuritySnapshots().data;
  const securities = useSecurities().data;
  const settings = useForecastSettings().data;
  const { payments } = useGoalProgressPayments();
  return React.useMemo(() => {
    if (amount <= 0 || !snapshots || !securities || !settings) return null;
    const depot = depotAssumptions(snapshots, reinvestedIds(securities));
    if (!depot) return null;
    return bonusValue({
      amount,
      depot,
      settings,
      ratio: netRatio(payments, isoFromRef(today)),
      today,
    });
  }, [amount, snapshots, securities, settings, payments, today]);
}
