import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ExternalLink, Pencil, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useToday } from "@/lib/hooks/useToday";
import { computeGoalProgress } from "@/lib/goals";
import { useDeleteGoal, useGoal, useGoalProgressPayments } from "./hooks";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalMark } from "./GoalMark";
import { GoalFormDialog } from "./GoalFormDialog";
import { DeleteGoalDialog } from "./DeleteGoalDialog";
import {
  autoGoalTitle,
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
  const today = useToday();
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
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Ziel wird geladen …</span>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
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

  const title = goalDisplayTitle(goal);
  const timing = isUpcoming ? startsAtLabel(goal) : timeProgressText(progress);
  // Zielart und Zeitraum nur bei eigenem Titel: Der automatische Titel nennt
  // beides schon („Monatsziel November 2026"), die Zeile wiederholte ihn sonst.
  // Ein Satz statt zweier Teile: Getrennt blieb der Punkt beim Umbruch allein
  // am Zeilenende stehen.
  const subtitle =
    title === autoGoalTitle(goal)
      ? timing
      : `${goalTypeBadgeLabel(goal)}\u00A0· ${timing}`;

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
        leading={<GoalMark className="mt-0.5" />}
        title={title}
        badge={
          <Badge variant={badgeVariantByTone[tone]}>{statusLabel(progress.status)}</Badge>
        }
        subtitle={subtitle}
      />

      {/* Ohne Kartenrahmen wie der Kopf der Uebersicht: Balken, darunter die
          Betraege auf gedaempfter Flaeche (seit 1.9.0). */}
      <div className="space-y-5">
        {!isUpcoming && <GoalProgressBar progress={progress} />}

        {/* Zwei Spalten schon auf dem Telefon: Vier Werte untereinander
            fuellten den halben Bildschirm. */}
        <dl className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1.5 sm:grid-cols-3">
          <div className="min-w-0 px-2.5 py-2 sm:px-4 sm:py-3">
            <dt className="text-[0.8125rem] text-muted-foreground">Zielbetrag</dt>
            <dd className="mt-0.5 text-[1.0625rem] font-semibold tabular-nums">
              {money(progress.target)}
            </dd>
          </div>
          {!isUpcoming && (
            <>
              <div className="min-w-0 px-2.5 py-2 sm:px-4 sm:py-3">
                <dt className="text-[0.8125rem] text-muted-foreground">Erhalten</dt>
                <dd className="mt-0.5 text-[1.0625rem] font-semibold tabular-nums">
                  {money(progress.actual)}
                </dd>
              </div>
              <div className="min-w-0 px-2.5 py-2 sm:px-4 sm:py-3">
                <dt className="text-[0.8125rem] text-muted-foreground">
                  {remainder.label}
                </dt>
                <dd className="mt-0.5 text-[1.0625rem] font-semibold tabular-nums">
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
      </div>

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
