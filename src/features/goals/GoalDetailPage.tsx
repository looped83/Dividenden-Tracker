import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ExternalLink, Pencil, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { refDateFromDate } from "@/lib/statistics";
import { computeGoalProgress } from "@/lib/goals";
import { useDeleteGoal, useGoal, useGoalProgressPayments } from "./hooks";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalTypeMark } from "./GoalTypeMark";
import { GoalFormDialog } from "./GoalFormDialog";
import { DeleteGoalDialog } from "./DeleteGoalDialog";
import {
  drillDownHref,
  goalDisplayTitle,
  goalTypeBadgeLabel,
  money,
  startsAtLabel,
  statusLabel,
  statusTone,
  timeProgressText,
} from "./format";
import { formatTimestampDate } from "@/lib/utils/formatDate";

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatTimestampDate(date);
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

  const backLink = <DetailBackLink to="/ziele" label="Zur Zielübersicht" />;

  if (goalQuery.isLoading || paymentsLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6" aria-busy="true">
            <span className="sr-only">Ziel wird geladen …</span>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (goalQuery.isError || !goal) {
    return (
      <div className="space-y-6">
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

  // Kein eigener Wert fuer die Zielerreichung: Den Prozentsatz nennt der
  // Balken, und „Noch bis zum Ziel: Noch … bis zum Ziel" sagte dasselbe zweimal.
  const remainder =
    progress.status === "exceeded"
      ? { label: "Übertroffen um", value: money(progress.overshoot) }
      : { label: "Noch bis zum Ziel", value: money(progress.remaining) };

  return (
    <div className="space-y-6">
      <DetailHeader
        back={backLink}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Bearbeiten"
              onClick={() => {
                setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Löschen"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
        leading={<GoalTypeMark goal={goal} className="mt-0.5" />}
        title={goalDisplayTitle(goal)}
        badge={
          <Badge variant={badgeVariantByTone[tone]}>{statusLabel(progress.status)}</Badge>
        }
        // Die Zielart als Text (nur hier; Karte und Uebersicht tragen sie als
        // Zeichen), dazu wie weit der Zeitraum ist.
        subtitle={
          <>
            <span>{goalTypeBadgeLabel(goal)}</span>
            <span>·</span>
            <span>{isUpcoming ? startsAtLabel(goal) : timeProgressText(progress)}</span>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-6 p-4 sm:p-6">
          {!isUpcoming && <GoalProgressBar progress={progress} />}

          {/* Zwei Spalten schon auf dem Telefon: Vier Werte untereinander
              fuellten den halben Bildschirm. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <dt className="text-xs text-muted-foreground">Zielbetrag</dt>
              <dd className="tabular-nums text-lg font-semibold">
                {money(progress.target)}
              </dd>
            </div>
            {!isUpcoming && (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">Erhalten</dt>
                  <dd className="tabular-nums text-lg font-semibold">
                    {money(progress.actual)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{remainder.label}</dt>
                  <dd className="tabular-nums text-lg font-semibold">
                    {remainder.value}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <Button
            asChild
            variant="outline"
            // Das Label ist zu lang fuer schmale Viewports; Buttons sind
            // standardmaessig whitespace-nowrap und wuerden sonst ueberstehen.
            className="h-auto min-h-11 w-full whitespace-normal py-2 sm:w-auto"
          >
            <Link to={drillDownHref(goal)}>
              <ExternalLink aria-hidden className="shrink-0" /> Eingänge des Zeitraums
              anzeigen
            </Link>
          </Button>

          {goal.note && (
            <div>
              <h2 className="text-xs text-muted-foreground">Notiz</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{goal.note}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:gap-4">
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
