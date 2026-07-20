import { Link } from "react-router";
import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AnalyticsPayment, RefDate, YearSelection } from "@/lib/statistics";
import { computeGoalProgress, type GoalProgress } from "@/lib/goals";
import { useGoals } from "@/features/goals/hooks";
import {
  achievementText,
  goalDisplayTitle,
  money,
  periodLabel,
  remainderText,
  statusLabel,
  statusTone,
} from "@/features/goals/format";

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

/** Kompakte Zielkarte fuer das Dashboard (Auftrag §25): Kernwerte + Detaillink. */
function CompactGoalCard({ progress }: { progress: GoalProgress }) {
  const tone = statusTone(progress.status);
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/ziele/${progress.goal.id}`}
              className="block truncate rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {goalDisplayTitle(progress.goal)}
            </Link>
            <p className="text-xs text-muted-foreground">{periodLabel(progress.goal)}</p>
          </div>
          <Badge variant={badgeVariantByTone[tone]}>{statusLabel(progress.status)}</Badge>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="tabular-nums font-medium">{money(progress.actual)}</span>
          <span className="text-xs text-muted-foreground">
            von {money(progress.target)} · {achievementText(progress.percent)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{remainderText(progress)}</p>
      </CardContent>
    </Card>
  );
}

interface GoalSectionProps {
  payments: readonly AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/**
 * Kompakte Zielsektion des Dashboards (Auftrag §25/§26). Interaktion:
 * - Einzelnes Jahr gewaehlt → Jahresziel dieses Jahres (falls vorhanden), sonst
 *   ein leerer Zustand mit Anlege-Aktion.
 * - „Alle Jahre" → keine einzelne Jahres-Zielkarte, stattdessen ein klarer Link
 *   zur Zielübersicht.
 * - Die Karte fuer das aktive Monatsziel des aktuellen Monats bleibt unabhaengig
 *   von der Jahresauswahl (konsistent zur Monatskennzahl des Dashboards).
 * Keine Zielkarte verwendet je einen anderen Zeitraum als ihre Beschriftung.
 */
export function GoalSection({ payments, selection, today }: GoalSectionProps) {
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];

  const annualGoal =
    selection === "all"
      ? null
      : (goals.find((g) => g.goalType === "annual" && g.year === selection) ?? null);

  const monthlyGoal =
    goals.find(
      (g) => g.goalType === "monthly" && g.year === today.year && g.month === today.month,
    ) ?? null;

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

  return (
    <section className="space-y-3" aria-label="Ziele">
      {heading}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {selection === "all" ? (
          <Card className="sm:col-span-2">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted-foreground">
                Wähle ein Jahr aus, um das zugehörige Jahresziel zu sehen, oder öffne die
                Zielübersicht.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/ziele">Zur Zielübersicht</Link>
              </Button>
            </CardContent>
          </Card>
        ) : annualProgress ? (
          <CompactGoalCard progress={annualProgress} />
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

        {monthlyProgress && <CompactGoalCard progress={monthlyProgress} />}
      </div>
    </section>
  );
}
