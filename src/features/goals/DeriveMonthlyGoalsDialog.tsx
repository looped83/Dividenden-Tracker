import * as React from "react";
import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import type { DerivedMonthlyGoal } from "@/lib/goals";
import { EUR, formatMoneyWhole, sumMoney } from "@/lib/money";
import { monthNameDe } from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { useCreateGoals } from "./hooks";

/**
 * Bestätigung vor dem Anlegen: welche Monate welches Ziel bekommen. Danach
 * ist jedes Monatsziel ein gewöhnliches Ziel, das sich einzeln ändern lässt.
 */
export function DeriveMonthlyGoalsDialog({
  open,
  onOpenChange,
  year,
  derived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  derived: readonly DerivedMonthlyGoal[];
}) {
  const create = useCreateGoals();
  const [error, setError] = React.useState<string | null>(null);
  const count = formatCountNoun(derived.length, "Monatsziel", "Monatsziele");

  const confirm = () => {
    setError(null);
    create.mutate(
      derived.map((item) => ({
        goal_type: "monthly" as const,
        year,
        month: item.month,
        target_amount: item.amount.toStringValue(),
        title: null,
        note: null,
      })),
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (cause) => {
          setError(
            getErrorMessage(cause, "Die Monatsziele konnten nicht angelegt werden."),
          );
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={`Monatsziele ${String(year)} ableiten?`}
      summary={
        <ConfirmSummary
          items={[
            ...derived.map((item) => ({
              label: monthNameDe(item.month),
              value: formatMoneyWhole(item.amount),
            })),
            {
              label: "Zusammen",
              value: formatMoneyWhole(
                sumMoney(
                  derived.map((item) => item.amount),
                  EUR,
                ),
              ),
            },
          ]}
        />
      }
      error={error}
      isPending={create.isPending}
      confirmVariant="default"
      confirmLabel={`${count} anlegen`}
      pendingLabel="Wird angelegt …"
      onConfirm={confirm}
    />
  );
}
