import * as React from "react";
import { Link } from "react-router";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { EUR, formatMoney, sumMoney } from "@/lib/money";
import type { FixedCost } from "@/lib/progress";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { FixedCostDialog } from "./FixedCostDialog";
import { FIXED_COSTS_MAX, useFixedCosts, useSaveFixedCosts } from "./hooks";

/**
 * Alle Fixkosten (seit 2.15.0): die Pflegeseite zur kurzen Liste im
 * Fortschritt. Je Position Stift und Papierkorb wie im Kopf einer Dividende,
 * alphabetisch, damit man eine Position schnell findet.
 */
export function FixedCostsPage() {
  const { data: costs = [], isLoading, isError, error } = useFixedCosts();
  const save = useSaveFixedCosts();
  const [adding, setAdding] = React.useState(false);
  const [editCost, setEditCost] = React.useState<FixedCost | null>(null);
  const [deleteCost, setDeleteCost] = React.useState<FixedCost | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const sorted = React.useMemo(
    () => [...costs].sort((a, b) => a.name.localeCompare(b.name, "de")),
    [costs],
  );

  const backLink = <DetailBackLink to="/fortschritt" label="Zum Fortschritt" />;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {backLink}
        <span className="sr-only">Fixkosten werden geladen …</span>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={Receipt}
          title="Fixkosten konnten nicht geladen werden"
          description={getErrorMessage(error, "Beim Laden ist ein Fehler aufgetreten.")}
          action={
            <Button asChild>
              <Link to="/fortschritt">Zum Fortschritt</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const confirmDelete = () => {
    if (!deleteCost) return;
    setDeleteError(null);
    save.mutate(
      costs.filter((other) => other.id !== deleteCost.id),
      {
        onSuccess: () => {
          setDeleteCost(null);
        },
        onError: (cause) => {
          setDeleteError(
            getErrorMessage(cause, "Die Fixkosten konnten nicht gelöscht werden."),
          );
        },
      },
    );
  };

  const total = sumMoney(
    costs.map((cost) => cost.amount),
    EUR,
  );

  return (
    <div className="space-y-6">
      <DetailHeader
        back={backLink}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="Neue Fixkosten"
            aria-haspopup="dialog"
            disabled={costs.length >= FIXED_COSTS_MAX}
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus />
          </Button>
        }
        title="Fixkosten"
        subtitle={
          costs.length > 0
            ? `${formatCountNoun(costs.length, "Position", "Positionen")} · ${formatMoney(total)} im Monat`
            : undefined
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Noch keine Fixkosten"
          description="Trag ein, was jeden Monat anfällt, etwa Strom, Handy oder Fitnessstudio."
          action={
            <Button
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus aria-hidden /> Fixkosten eintragen
            </Button>
          }
        />
      ) : (
        <ListGroup className="max-w-2xl">
          {sorted.map((cost) => (
            <li key={cost.id}>
              <ListRow>
                <ListItemBody
                  title={cost.name}
                  meta={
                    <>
                      {formatMoney(cost.amount)}
                      <span className="sr-only"> im Monat</span>
                    </>
                  }
                  trailing={
                    <span className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`${cost.name} bearbeiten`}
                        aria-haspopup="dialog"
                        onClick={() => {
                          setEditCost(cost);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`${cost.name} löschen`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteCost(cost);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  }
                />
              </ListRow>
            </li>
          ))}
        </ListGroup>
      )}

      <FixedCostDialog open={adding} onOpenChange={setAdding} costs={costs} />
      <FixedCostDialog
        open={editCost !== null}
        onOpenChange={(next) => {
          if (!next) setEditCost(null);
        }}
        costs={costs}
        cost={editCost ?? undefined}
      />
      <ConfirmDialog
        open={deleteCost !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteCost(null);
        }}
        title="Fixkosten löschen?"
        summary={
          deleteCost && (
            <ConfirmSummary
              items={[
                { label: "Name", value: deleteCost.name },
                { label: "Im Monat", value: formatMoney(deleteCost.amount) },
              ]}
            />
          )
        }
        error={deleteError}
        isPending={save.isPending}
        confirmLabel="Löschen"
        pendingLabel="Wird gelöscht …"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
