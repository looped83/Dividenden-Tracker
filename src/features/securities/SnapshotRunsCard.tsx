import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListGroup, ListRow } from "@/components/ui/list";
import { useToast } from "@/components/ui/toast";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { useDeleteSnapshotRun, useSnapshotRuns } from "@/features/securities/hooks";
import type { SecuritySnapshotRun } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Die importierten Depotstaende, jeder einzeln loeschbar
 * (docs/PORTFOLIO_IMPORT.md).
 *
 * Ohne diese Liste liess sich ein Stand mit falschem Stichtag nicht mehr
 * entfernen. Lag der Tag in der Zukunft, galt er dauerhaft als juengster Stand
 * und verdeckte jeden spaeteren echten Import. Ein Stand desselben Tages wird
 * beim Import ersetzt; entfernen geht nur hier.
 *
 * Erscheint erst, wenn es etwas zu verwalten gibt.
 */
export function SnapshotRunsCard() {
  const { data: runs = [] } = useSnapshotRuns();
  const [target, setTarget] = React.useState<SecuritySnapshotRun | null>(null);

  if (runs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Depotstände</CardTitle>
      </CardHeader>
      <CardContent>
        <ListGroup inset aria-label="Depotstände">
          {runs.map((run) => {
            const date = formatCalendarDate(run.as_of);
            return (
              <li key={run.id}>
                <ListRow className="pr-1">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">Stand vom {date}</span>
                    <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {formatCountNoun(run.rows_imported, "Position", "Positionen")}
                      {run.file_name && ` · ${run.file_name}`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-my-2 shrink-0"
                    aria-label={`Depotstand vom ${date} löschen`}
                    onClick={() => {
                      setTarget(run);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </ListRow>
              </li>
            );
          })}
        </ListGroup>
      </CardContent>
      <DeleteSnapshotRunDialog
        run={target}
        runs={runs}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </Card>
  );
}

/**
 * Was das Depot nach dem Loeschen zeigt. Nur fuer den juengsten Stand ist das
 * eine Aenderung der Uebersicht; aeltere Staende fehlen danach lediglich im
 * Verlauf. `runs` ist juengster zuerst sortiert (`fetchSnapshotRuns`).
 */
function consequenceOf(
  run: SecuritySnapshotRun,
  runs: readonly SecuritySnapshotRun[],
): string {
  if (runs[0]?.id !== run.id) {
    return "Der aktuelle Stand bleibt unverändert, der Verlauf verliert diesen Stichtag.";
  }
  const next = runs.find((other) => other.id !== run.id && other.rows_imported > 0);
  return next
    ? `Danach zeigt das Depot den Stand vom ${formatCalendarDate(next.as_of)}.`
    : "Danach zeigt das Depot keine Positionen mehr.";
}

function DeleteSnapshotRunDialog({
  run,
  runs,
  onOpenChange,
}: {
  /** Der zu loeschende Stand; `null` schliesst den Dialog. */
  run: SecuritySnapshotRun | null;
  runs: readonly SecuritySnapshotRun[];
  onOpenChange: (open: boolean) => void;
}) {
  const deleteRun = useDeleteSnapshotRun();
  const { notify } = useToast();
  const { error, showError, clearError } = useErrorState();

  const handleDelete = async () => {
    if (!run) return;
    clearError();
    try {
      await deleteRun.mutateAsync(run.as_of);
      onOpenChange(false);
      notify(`Depotstand vom ${formatCalendarDate(run.as_of)} gelöscht.`);
    } catch (cause) {
      showError(cause, "Der Depotstand konnte nicht gelöscht werden.");
    }
  };

  return (
    <Dialog
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) clearError();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Depotstand löschen</DialogTitle>
        </DialogHeader>
        {run && (
          <p className="text-sm text-muted-foreground">
            Der Depotstand vom {formatCalendarDate(run.as_of)} mit{" "}
            {formatCountNoun(run.rows_imported, "Position", "Positionen")} wird entfernt.
            Erhaltene Dividenden bleiben unberührt. {consequenceOf(run, runs)}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={deleteRun.isPending}
            onClick={() => void handleDelete()}
          >
            {deleteRun.isPending ? "Wird gelöscht …" : "Depotstand löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
