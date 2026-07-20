import { Link } from "react-router";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoalProgress } from "@/lib/goals";
import { GoalProgressBar } from "./GoalProgressBar";
import {
  goalDisplayTitle,
  goalTypeLabel,
  money,
  periodLabel,
  remainderText,
  startsAtLabel,
  statusLabel,
  statusTone,
  timeProgressText,
} from "./format";

interface GoalCardProps {
  progress: GoalProgress;
  onEdit: (goalId: string) => void;
  onDelete: (goalId: string) => void;
}

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

/**
 * Wiederverwendbare Zielkarte (Auftrag §18). Stellt alle fachlichen Zustände
 * zuverlässig dar (bevorstehend, aktiv, erreicht, übertroffen, beendet und nicht
 * erreicht). Lade-/Fehler-/Leerzustände werden auf Seitenebene behandelt. Alle
 * Werte stammen aus der zentralen Goal-Domain-Schicht — keine Berechnung hier.
 */
export function GoalCard({ progress, onEdit, onDelete }: GoalCardProps) {
  const { goal, status } = progress;
  const title = goalDisplayTitle(goal);
  const hasCustomTitle = Boolean(goal.title?.trim());
  const tone = statusTone(status);
  const isUpcoming = status === "upcoming";

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/ziele/${goal.id}`}
              className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h3 className="truncate text-base font-semibold tracking-tight">{title}</h3>
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {goalTypeLabel(goal.goalType)}
              {hasCustomTitle ? ` · ${periodLabel(goal)}` : ""}
            </p>
          </div>
          <Badge variant={badgeVariantByTone[tone]}>{statusLabel(status)}</Badge>
        </div>

        {isUpcoming ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <span>{startsAtLabel(goal)}</span>
          </div>
        ) : (
          <GoalProgressBar progress={progress} />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Zielbetrag</dt>
            <dd className="tabular-nums font-medium">{money(progress.target)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Erhalten</dt>
            <dd className="tabular-nums font-medium">{money(progress.actual)}</dd>
          </div>
        </dl>

        {!isUpcoming && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{remainderText(progress)}</p>
            <p className="text-xs text-muted-foreground">{timeProgressText(progress)}</p>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link to={`/ziele/${goal.id}`}>Öffnen</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onEdit(goal.id);
            }}
          >
            <Pencil aria-hidden /> Bearbeiten
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-negative hover:text-negative"
            onClick={() => {
              onDelete(goal.id);
            }}
          >
            <Trash2 aria-hidden /> Löschen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
