import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MONTH_NAMES_DE } from "@/lib/statistics";
import { toGermanDecimalString } from "@/lib/money";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  GoalConflictError,
  GoalDuplicateError,
  type GoalInsert,
} from "@/lib/supabase/repositories/goals";
import type { GoalWithMeta } from "./hooks";
import { useCreateGoal, useUpdateGoal } from "./hooks";
import {
  goalFormSchema,
  maxGoalYear,
  MIN_GOAL_YEAR,
  type GoalFormInput,
  type GoalFormValues,
} from "./schemas";

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vorhandenes Ziel = Bearbeiten; null = Anlegen. */
  goal: GoalWithMeta | null;
  /** Optionaler Startwert der Zielart beim Anlegen. */
  onSaved?: (goalId: string) => void;
}

function defaultInput(goal: GoalWithMeta | null): GoalFormInput {
  if (goal) {
    return {
      goalType: goal.goalType,
      year: String(goal.year),
      month: goal.month !== null ? String(goal.month) : "",
      targetAmount: toGermanDecimalString(goal.targetAmount.toStringValue()),
      title: goal.title ?? "",
      note: goal.note ?? "",
    };
  }
  return {
    goalType: "annual",
    year: String(new Date().getFullYear()),
    month: "",
    targetAmount: "",
    title: "",
    note: "",
  };
}

function yearOptions(selectedYear: number): number[] {
  const current = new Date().getFullYear();
  const min = Math.min(current - 5, selectedYear, MIN_GOAL_YEAR + 30);
  const max = Math.max(maxGoalYear(), selectedYear);
  const years: number[] = [];
  for (let year = max; year >= Math.max(min, MIN_GOAL_YEAR); year -= 1) {
    years.push(year);
  }
  return years;
}

/**
 * Erstellungs- und Bearbeitungsdialog fuer Ziele (Auftrag §20/§22). Nutzt die
 * bestehende Formulararchitektur (React Hook Form + Zod), decimal-sichere
 * Betragsverarbeitung, verstaendliche Fehlermeldungen, Tastaturbedienung und
 * Schutz vor Mehrfach-Übermittlung (Button disabled bei isSubmitting). Beim
 * Bearbeiten greift Optimistic Concurrency ueber updated_at.
 */
export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  onSaved,
}: GoalFormDialogProps) {
  const isEdit = goal !== null;
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormInput, unknown, GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: defaultInput(goal),
  });

  // Bei jedem Öffnen (bzw. Zielwechsel) sauber aus dem Ziel vorbelegen.
  React.useEffect(() => {
    if (open) {
      reset(defaultInput(goal));
      setSubmitError(null);
    }
  }, [open, goal, reset]);

  const goalType = watch("goalType");
  const watchedYear = Number.parseInt(watch("year"), 10);
  const years = yearOptions(
    Number.isNaN(watchedYear) ? new Date().getFullYear() : watchedYear,
  );

  const onValid = async (values: GoalFormValues) => {
    setSubmitError(null);
    const payload: GoalInsert = {
      goal_type: values.goalType,
      year: values.year,
      month: values.goalType === "monthly" ? values.month : null,
      target_amount: values.targetAmount,
      title: emptyToNull(values.title ?? ""),
      note: emptyToNull(values.note ?? ""),
    };
    try {
      if (goal) {
        const updated = await updateGoal.mutateAsync({
          id: goal.id,
          input: payload,
          expectedUpdatedAt: goal.updatedAt,
        });
        onOpenChange(false);
        onSaved?.(updated.id);
      } else {
        const created = await createGoal.mutateAsync(payload);
        onOpenChange(false);
        onSaved?.(created.id);
      }
    } catch (error) {
      if (error instanceof GoalDuplicateError || error instanceof GoalConflictError) {
        setSubmitError(error.message);
        return;
      }
      setSubmitError(getErrorMessage(error, "Das Ziel konnte nicht gespeichert werden."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Ziel bearbeiten" : "Neues Ziel anlegen"}</DialogTitle>
          <DialogDescription>
            Ein Ziel ist ein von dir gewählter Vergleichswert für deine tatsächlich
            erhaltenen Dividenden – keine Prognose.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(onValid)(event)}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="goal-type">Zielart</Label>
            <Select id="goal-type" {...register("goalType")}>
              <option value="annual">Jahresziel</option>
              <option value="monthly">Monatsziel</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-year">Kalenderjahr</Label>
              <Select id="goal-year" {...register("year")}>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
              {errors.year && (
                <p role="alert" className="text-sm text-negative">
                  {errors.year.message}
                </p>
              )}
            </div>

            {goalType === "monthly" && (
              <div className="space-y-1.5">
                <Label htmlFor="goal-month">Kalendermonat</Label>
                <Select id="goal-month" {...register("month")}>
                  <option value="">Monat wählen …</option>
                  {MONTH_NAMES_DE.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
                {errors.month && (
                  <p role="alert" className="text-sm text-negative">
                    {errors.month.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-amount">Zielbetrag (€)</Label>
            <Input
              id="goal-amount"
              inputMode="decimal"
              placeholder="z. B. 1.000,00"
              {...register("targetAmount")}
            />
            {errors.targetAmount && (
              <p role="alert" className="text-sm text-negative">
                {errors.targetAmount.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Titel (optional)</Label>
            <Input
              id="goal-title"
              placeholder="z. B. Dividendenziel 2027"
              {...register("title")}
            />
            {errors.title && (
              <p role="alert" className="text-sm text-negative">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-note">Notiz (optional)</Label>
            <Textarea id="goal-note" rows={2} {...register("note")} />
            {errors.note && (
              <p role="alert" className="text-sm text-negative">
                {errors.note.message}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-negative">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Wird gespeichert …"
                : isEdit
                  ? "Speichern"
                  : "Ziel anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
