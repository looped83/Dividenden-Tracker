import * as React from "react";
import { useNavigate } from "react-router";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { refDateFromDate } from "@/lib/statistics";
import { computeGoalProgress, sortGoalProgress, type GoalProgress } from "@/lib/goals";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  useDeleteGoal,
  useGoalProgressPayments,
  useGoals,
  type GoalWithMeta,
} from "./hooks";
import { GoalCard } from "./GoalCard";
import { GoalFormDialog } from "./GoalFormDialog";
import { DeleteGoalDialog } from "./DeleteGoalDialog";

function Section({
  title,
  description,
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  description?: string;
  items: GoalProgress[];
  onEdit: (goalId: string) => void;
  onDelete: (goalId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby={`goals-${title}`}>
      <div>
        <h2 id={`goals-${title}`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((progress) => (
          <GoalCard
            key={progress.goal.id}
            progress={progress}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function GoalsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
    >
      <span className="sr-only">Ziele werden geladen …</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function GoalsPage() {
  const navigate = useNavigate();
  const today = React.useMemo(() => refDateFromDate(), []);
  const goalsQuery = useGoals();
  const { payments, isLoading: paymentsLoading } = useGoalProgressPayments();
  const deleteGoal = useDeleteGoal();
  const { error: deleteError, showError, clearError } = useErrorState();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GoalWithMeta | null>(null);
  const [deleting, setDeleting] = React.useState<GoalWithMeta | null>(null);

  const goals = React.useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);
  const byId = React.useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const progressList = React.useMemo(
    () => goals.map((goal) => computeGoalProgress(goal, payments, today)),
    [goals, payments, today],
  );

  const active = sortGoalProgress(
    progressList.filter((p) => p.time.status === "current"),
  );
  const upcoming = sortGoalProgress(
    progressList.filter((p) => p.time.status === "upcoming"),
  );
  const historical = sortGoalProgress(
    progressList.filter((p) => p.time.status === "ended"),
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (goalId: string) => {
    setEditing(byId.get(goalId) ?? null);
    setFormOpen(true);
  };
  const openDelete = (goalId: string) => {
    clearError();
    setDeleting(byId.get(goalId) ?? null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    clearError();
    deleteGoal.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
      },
      onError: (error) => {
        showError(error, "Das Ziel konnte nicht gelöscht werden.");
      },
    });
  };

  const heading = (
    <PageHeader
      title="Ziele"
      actions={
        <Button onClick={openCreate}>
          <Plus aria-hidden /> Ziel anlegen
        </Button>
      }
    />
  );

  return (
    <div className="space-y-8">
      {heading}

      {goalsQuery.isLoading || paymentsLoading ? (
        <GoalsSkeleton />
      ) : goalsQuery.isError ? (
        <EmptyState
          icon={Target}
          title="Ziele konnten nicht geladen werden"
          description={getErrorMessage(
            goalsQuery.error,
            "Beim Laden der Ziele ist ein Fehler aufgetreten.",
          )}
          action={
            <Button onClick={() => void goalsQuery.refetch()}>Erneut versuchen</Button>
          }
        />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Noch keine Ziele angelegt"
          description="Lege ein Jahres- oder Monatsziel fest, um deine tatsächlich erhaltenen Dividendeneinnahmen damit zu vergleichen."
          action={
            <Button onClick={openCreate}>
              <Plus aria-hidden /> Erstes Ziel anlegen
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <Section
            title="Aktive Ziele"
            description="Ziele, deren Zeitraum gerade läuft."
            items={active}
            onEdit={openEdit}
            onDelete={openDelete}
          />
          <Section
            title="Bevorstehende Ziele"
            description="Ziele, deren Zeitraum noch nicht begonnen hat."
            items={upcoming}
            onEdit={openEdit}
            onDelete={openDelete}
          />
          <Section
            title="Beendete Ziele"
            description="Abgeschlossene Zeiträume – erreicht, übertroffen oder nicht erreicht."
            items={historical}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </div>
      )}

      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editing}
        onSaved={(goalId) => {
          if (!editing) void navigate(`/ziele/${goalId}`);
        }}
      />
      <DeleteGoalDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            clearError();
          }
        }}
        goal={deleting}
        error={deleteError}
        isPending={deleteGoal.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
