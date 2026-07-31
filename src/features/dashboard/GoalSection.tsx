import { Link } from "react-router";
import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalyticsPayment, RefDate, YearSelection } from "@/lib/statistics";
import { computeGoalProgress } from "@/lib/goals";
import { useGoals } from "@/features/goals/hooks";
import { GoalCard } from "@/features/goals/GoalCard";

interface GoalSectionProps {
  payments: readonly AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/**
 * Zielsektion der Uebersicht (Auftrag §25/§26).
 *
 * Die Karte ist **dieselbe** wie auf der Zielseite (`GoalCard`). Zuvor gab es
 * hier eine eigene, kuerzere Fassung: Dasselbe Ziel sah an zwei Stellen
 * unterschiedlich aus, und die Zielart war in keiner der beiden auf den ersten
 * Blick zu erkennen. Bearbeiten und Loeschen fehlen hier, weil die Dialoge
 * dafuer auf der Zielseite liegen.
 *
 * **Gezeigt wird ausschliesslich, was zum gewaehlten Jahr gehoert.** Wer 2024
 * betrachtet, sieht das Jahresziel 2024 — und nicht daneben das Monatsziel des
 * heutigen Monats, das zu einem ganz anderen Jahr gehoert. Das Monatsziel
 * erscheint deshalb nur im laufenden Jahr.
 *
 * Bei „Alle Jahre" entfaellt der Bereich ganz: Ziele sind immer an einen
 * Zeitraum gebunden, „alle Jahre" ist keiner. Eine Karte, die nur sagt „waehle
 * ein Jahr", ist kein Inhalt — der Weg zu den Zielen steht in der Navigation.
 */
export function GoalSection({ payments, selection, today }: GoalSectionProps) {
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];

  const annualGoal =
    selection === "all"
      ? null
      : (goals.find((g) => g.goalType === "annual" && g.year === selection) ?? null);

  // Das Monatsziel gehoert zum laufenden Monat — und damit zum laufenden Jahr.
  // In einem anderen Jahr stuende es fuer einen Zeitraum, den die Seite
  // gerade gar nicht zeigt.
  const monthlyGoal =
    selection === today.year
      ? (goals.find(
          (g) =>
            g.goalType === "monthly" && g.year === today.year && g.month === today.month,
        ) ?? null)
      : null;

  const annualProgress = annualGoal
    ? computeGoalProgress(annualGoal, payments, today)
    : null;
  const monthlyProgress = monthlyGoal
    ? computeGoalProgress(monthlyGoal, payments, today)
    : null;

  const heading = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Ziele</h2>
      <Button asChild variant="ghost" size="sm">
        <Link to="/ziele">Alle Ziele</Link>
      </Button>
    </div>
  );

  if (selection === "all") return null;

  return (
    <section className="space-y-3" aria-label="Ziele">
      {heading}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
        {annualProgress ? (
          <GoalCard progress={annualProgress} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="size-4" aria-hidden />
                <span>Noch kein Jahresziel für {selection} festgelegt</span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/ziele">Ziel anlegen</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {monthlyProgress && <GoalCard progress={monthlyProgress} />}
      </div>
    </section>
  );
}
