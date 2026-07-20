import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Goal } from "@/lib/goals";
import { goalDisplayTitle, goalTypeLabel, money, periodLabel } from "./format";

interface DeleteGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
  error: string | null;
  isPending: boolean;
  onConfirm: () => void;
}

/**
 * Bestätigungsdialog für die dauerhafte Löschung eines Ziels (Auftrag §23).
 * Zeigt Titel, Zielart, Zeitraum und Zielbetrag und weist ausdrücklich darauf
 * hin, dass keine Dividendeneingänge verändert werden. Die bestätigende
 * Schaltfläche heißt „Ziel dauerhaft löschen" – kein generisches „OK".
 */
export function DeleteGoalDialog({
  open,
  onOpenChange,
  goal,
  error,
  isPending,
  onConfirm,
}: DeleteGoalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ziel dauerhaft löschen?</DialogTitle>
        </DialogHeader>
        {goal && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <dt className="text-muted-foreground">Titel</dt>
            <dd className="text-right font-medium">{goalDisplayTitle(goal)}</dd>
            <dt className="text-muted-foreground">Zielart</dt>
            <dd className="text-right">{goalTypeLabel(goal.goalType)}</dd>
            <dt className="text-muted-foreground">Zeitraum</dt>
            <dd className="text-right">{periodLabel(goal)}</dd>
            <dt className="text-muted-foreground">Zielbetrag</dt>
            <dd className="text-right tabular-nums">{money(goal.targetAmount)}</dd>
          </dl>
        )}
        <p className="text-sm text-muted-foreground">
          Das Ziel wird endgültig entfernt. Deine Dividendeneingänge, Dashboardwerte und
          Statistiken bleiben unverändert.
        </p>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Abbrechen
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Wird gelöscht …" : "Ziel dauerhaft löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
