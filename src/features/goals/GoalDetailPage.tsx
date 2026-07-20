import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ExternalLink, Pencil, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { refDateFromDate } from "@/lib/statistics";
import { computeGoalProgress } from "@/lib/goals";
import { useDeleteGoal, useGoal, useGoalProgressPayments } from "./hooks";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalFormDialog } from "./GoalFormDialog";
import { DeleteGoalDialog } from "./DeleteGoalDialog";
import {
  achievementText,
  drillDownHref,
  goalDisplayTitle,
  goalTypeLabel,
  money,
  periodLabel,
  remainderText,
  statusLabel,
  statusTone,
  timeProgressText,
} from "./format";

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

export function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = React.useMemo(() => refDateFromDate(), []);
  const goalQuery = useGoal(id);
  const { payments, isLoading: paymentsLoading } = useGoalProgressPayments();
  const deleteGoal = useDeleteGoal();

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const goal = goalQuery.data ?? null;

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/ziele">
        <ArrowLeft aria-hidden /> Zur Zielübersicht
      </Link>
    </Button>
  );

  if (goalQuery.isLoading || paymentsLoading) {
    return (
      <div className="space-y-4">
        {backLink}
        <Card>
          <CardContent className="space-y-4 p-6" aria-busy="true">
            <span className="sr-only">Ziel wird geladen …</span>
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (goalQuery.isError || !goal) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          icon={Target}
          title="Ziel nicht gefunden"
          description={getErrorMessage(
            goalQuery.error,
            "Das Ziel existiert nicht oder du hast keinen Zugriff darauf.",
          )}
          action={
            <Button asChild>
              <Link to="/ziele">Zur Zielübersicht</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const progress = computeGoalProgress(goal, payments, today);
  const tone = statusTone(progress.status);
  const isUpcoming = progress.status === "upcoming";

  const confirmDelete = () => {
    setDeleteError(null);
    deleteGoal.mutate(goal.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        void navigate("/ziele");
      },
      onError: (error) => {
        setDeleteError(getErrorMessage(error, "Das Ziel konnte nicht gelöscht werden."));
      },
    });
  };

  return (
    <div className="space-y-4">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {goalDisplayTitle(goal)}
            </h1>
            <Badge variant={badgeVariantByTone[tone]}>
              {statusLabel(progress.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {goalTypeLabel(goal.goalType)} · {periodLabel(goal)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditOpen(true);
            }}
          >
            <Pencil aria-hidden /> Bearbeiten
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-negative hover:text-negative"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 aria-hidden /> Löschen
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 p-6">
          {!isUpcoming && <GoalProgressBar progress={progress} />}

          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Zielbetrag</dt>
              <dd className="tabular-nums text-lg font-semibold">
                {money(progress.target)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tatsächlich erhalten</dt>
              <dd className="tabular-nums text-lg font-semibold">
                {money(progress.actual)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Zielerreichung</dt>
              <dd className="tabular-nums text-lg font-semibold">
                {achievementText(progress.percent)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {progress.status === "exceeded" ? "Übertroffen um" : "Noch bis zum Ziel"}
              </dt>
              <dd className="tabular-nums text-lg font-semibold">
                {remainderText(progress)}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-muted-foreground">{timeProgressText(progress)}</p>

          <div>
            <Button asChild variant="outline" size="sm">
              <Link to={drillDownHref(goal)}>
                <ExternalLink aria-hidden /> Dividendeneingänge des Zeitraums anzeigen
              </Link>
            </Button>
          </div>

          {goal.note && (
            <div>
              <h2 className="text-xs text-muted-foreground">Notiz</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{goal.note}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
            <div>
              <dt>Erstellt</dt>
              <dd>{formatTimestamp(goal.createdAt)}</dd>
            </div>
            <div>
              <dt>Zuletzt geändert</dt>
              <dd>{formatTimestamp(goal.updatedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <GoalFormDialog open={editOpen} onOpenChange={setEditOpen} goal={goal} />
      <DeleteGoalDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        goal={goal}
        error={deleteError}
        isPending={deleteGoal.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
