import * as React from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { Goal, GoalCourse } from "@/lib/goals";
import { EUR, Money, MoneyDecimal, formatMoneyWhole } from "@/lib/money";
import { monthNameDe, type RefDate } from "@/lib/statistics";
import { purchaseForGap } from "@/features/planner/purchase";
import { useAnalyticsPayments } from "@/features/dashboard/hooks";
import { forecastFacets, forecastTwelveMonths } from "@/features/securities/forecast";
import { AMOUNT_MAX, useForecastSettings } from "@/features/securities/forecastSettings";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";

/**
 * Aus der Lücke eine Aufgabe (seit 2.34.0, §13.3): Steht ein offenes Ziel
 * des laufenden Jahres auf „Knapp" oder „Unter Plan", nennt die Box, was
 * fehlt, und welcher Zukauf es bis zum Ende des Zeitraums schließen könnte —
 * mit dem Betrag vorbelegt in den Nachkauf. Ohne Depotstand oder ohne Asset,
 * das im Zeitraum noch zahlt, bleibt es bei der Lücke.
 */
export function GapPurchaseBox({
  goal,
  target,
  course,
  today,
}: {
  goal: Goal;
  target: Money;
  course: GoalCourse | null;
  today: RefDate;
}) {
  const gap =
    course && course.kind !== "onTrack" ? target.subtract(course.expected) : null;
  const purchase = useGapPurchase(goal, gap, today);
  if (!gap?.isPositive()) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <p className="font-semibold">Es fehlen ≈ {formatMoneyWhole(gap)}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
          {purchase
            ? `${formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(purchase.amount), EUR))} in ${purchase.name} schließen die Lücke bis ${monthNameDe(purchase.until)}`
            : "Im Zeitraum zahlt kein Asset mehr, das ein Zukauf noch erreicht"}
        </p>
      </div>
      {purchase && (
        <Button asChild className="shrink-0">
          <Link to={`/planer?betrag=${String(purchase.amount)}`}>Nachkauf planen</Link>
        </Button>
      )}
    </div>
  );
}

function useGapPurchase(goal: Goal, gap: Money | null, today: RefDate) {
  const securities = useSecurities().data;
  const snapshots = useSecuritySnapshots().data;
  const settings = useForecastSettings().data;
  const { payments } = useAnalyticsPayments();
  const forecast = React.useMemo(() => {
    if (!securities || !snapshots) return null;
    const result = forecastTwelveMonths({
      snapshots,
      facets: forecastFacets(securities),
      payments,
      today,
    });
    return result.kind === "ok" ? result.forecast : null;
  }, [securities, snapshots, payments, today]);

  return React.useMemo(() => {
    if (!forecast || !gap?.isPositive()) return null;
    return purchaseForGap({
      forecast,
      excluded: new Set(settings?.excluded ?? []),
      year: goal.year,
      month: goal.goalType === "monthly" ? goal.month : null,
      gap: gap.toDecimal(),
      today,
      max: AMOUNT_MAX,
    });
  }, [forecast, gap, settings, goal, today]);
}
