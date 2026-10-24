import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import type { Goal } from "@/lib/goals";
import { goalTitle, goalTypeLabel, money, periodLabel } from "./format";

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
 * Zeigt Titel, Zielart, Zeitraum und Zielbetrag.
 */
export function DeleteGoalDialog({ goal, ...props }: DeleteGoalDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      title="Ziel dauerhaft löschen?"
      summary={
        goal && (
          <ConfirmSummary
            items={[
              { label: "Titel", value: goalTitle(goal) },
              { label: "Zielart", value: goalTypeLabel(goal.goalType) },
              { label: "Zeitraum", value: periodLabel(goal) },
              { label: "Zielbetrag", value: money(goal.targetAmount) },
            ]}
          />
        )
      }
      confirmLabel="Dauerhaft löschen"
      pendingLabel="Wird gelöscht …"
    />
  );
}
