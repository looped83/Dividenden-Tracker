import * as React from "react";
import { Outlet, useNavigate } from "react-router";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { TabNav } from "@/components/layout/TabNav";
import { refDateFromDate } from "@/lib/statistics";
import { computeGoalProgress, sortGoalProgress } from "@/lib/goals";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  useDeleteGoal,
  useGoalProgressPayments,
  useGoals,
  type GoalWithMeta,
} from "./hooks";
import { GoalFormDialog } from "./GoalFormDialog";
import type { GoalsContext } from "./context";
import { DeleteGoalDialog } from "./DeleteGoalDialog";

function GoalsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
    >
      <span className="sr-only">Ziele werden geladen …</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-10 w-full" />
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

  const byStatus = React.useMemo(
    () => ({
      // Jede Gruppe in ihrer eigenen Ordnung: laufend nach Rahmen (Jahresziel
      // vor Monatszielen), bevorstehend das naechste zuerst, beendet das
      // zuletzt beendete zuerst.
      current: sortGoalProgress(
        progressList.filter((p) => p.time.status === "current"),
        "current",
      ),
      upcoming: sortGoalProgress(
        progressList.filter((p) => p.time.status === "upcoming"),
        "upcoming",
      ),
      ended: sortGoalProgress(
        progressList.filter((p) => p.time.status === "ended"),
        "ended",
      ),
    }),
    [progressList],
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

  const context: GoalsContext = React.useMemo(
    () => ({ byStatus, onEdit: openEdit, onDelete: openDelete }),
    // `openEdit`/`openDelete` haengen nur an stabilen Werten; sie hier zu
    // memoisieren waere Aufwand ohne Wirkung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byStatus],
  );

  // Die Zahl in der Beschriftung erspart den Klick in einen leeren Reiter.
  const tabs = [
    { to: "/ziele", label: `Aktiv (${String(byStatus.current.length)})`, end: true },
    {
      to: "/ziele/bevorstehend",
      label: `Bevorstehend (${String(byStatus.upcoming.length)})`,
    },
    { to: "/ziele/beendet", label: `Beendet (${String(byStatus.ended.length)})` },
  ];

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
    <div className="space-y-6">
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
        <div className="space-y-6">
          <TabNav label="Zielgruppen" tabs={tabs} />
          <Outlet context={context} />
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
