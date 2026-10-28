import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { compareGerman } from "@/lib/utils/compareText";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useSecurities } from "@/features/securities/hooks";
import { useSaveSavingsPlans } from "./savingsPlanHooks";
import { SAVINGS_PLANS_MAX, type SavingsPlan } from "./savingsPlans";
import { SavingsPlanFields } from "./SavingsPlanFields";
import {
  draftFromPlan,
  emptyDraft,
  planFromDraft,
  type SavingsPlanDraft,
} from "./savingsPlanDraft";

/**
 * Einen Sparplan anlegen, ändern oder löschen (seit 2.21.0) — aus Planer ›
 * Sparpläne; am Asset selbst seit 2.44.0 im Formular „Asset bearbeiten". Gespeichert wird die ganze Liste
 * mit dem geänderten Plan (wie die Fixkosten).
 */
export function SavingsPlanDialog({
  open,
  onOpenChange,
  plans,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Die ganze gespeicherte Liste. */
  plans: readonly SavingsPlan[];
  /** Der bearbeitete Plan; fehlt er, entsteht ein neuer. */
  plan?: SavingsPlan | undefined;
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const close = () => {
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          // Kein Fokus im ersten Feld: Auf dem iPhone spränge sonst sofort die
          // Tastatur auf.
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{plan ? "Sparplan bearbeiten" : "Neuer Sparplan"}</DialogTitle>
        </DialogHeader>
        <SavingsPlanForm plans={plans} plan={plan} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}

function SavingsPlanForm({
  plans,
  plan,
  onDone,
}: {
  plans: readonly SavingsPlan[];
  plan: SavingsPlan | undefined;
  onDone: () => void;
}) {
  const save = useSaveSavingsPlans();
  const { data: securities = [] } = useSecurities();
  const fixed = plan?.securityId;
  const [securityId, setSecurityId] = React.useState(fixed ?? "");
  const [draft, setDraft] = React.useState<SavingsPlanDraft>(() =>
    plan
      ? draftFromPlan(plan)
      : emptyDraft(securities.find((entry) => entry.id === fixed)?.default_depot_id),
  );
  const [error, setError] = React.useState<string | null>(null);
  const full = !plan && plans.length >= SAVINGS_PLANS_MAX;

  const options = React.useMemo(
    () =>
      securities
        .filter((entry) => entry.archived_at === null || entry.id === fixed)
        .sort((a, b) => compareGerman(a.name, b.name)),
    [securities, fixed],
  );
  const fixedName = securities.find((entry) => entry.id === fixed)?.name;

  const persist = async (next: readonly SavingsPlan[]) => {
    setError(null);
    try {
      await save.mutateAsync(next);
      onDone();
    } catch (cause) {
      setError(getErrorMessage(cause, "Der Sparplan konnte nicht gespeichert werden."));
    }
  };

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (securityId === "") {
      setError("Wähle ein Asset.");
      return;
    }
    const entry = planFromDraft(draft, securityId);
    if (typeof entry === "string") {
      setError(entry);
      return;
    }
    await persist(
      plan
        ? plans.map((other) => (other.id === plan.id ? entry : other))
        : [...plans, entry],
    );
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="savings-plan-security">Asset</Label>
        {fixedName !== undefined ? (
          <p id="savings-plan-security" className="text-sm font-medium">
            {fixedName}
          </p>
        ) : (
          <Select
            id="savings-plan-security"
            value={securityId}
            onChange={(event) => {
              setSecurityId(event.target.value);
              const chosen = securities.find((entry) => entry.id === event.target.value);
              if (draft.depotId === "" && chosen?.default_depot_id)
                setDraft({ ...draft, depotId: chosen.default_depot_id });
            }}
          >
            <option value="">Asset wählen</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <SavingsPlanFields idPrefix="savings-plan" draft={draft} onChange={setDraft} />

      {full && (
        <p role="alert" className="text-sm text-negative">
          Mehr als {SAVINGS_PLANS_MAX} Sparpläne sind nicht möglich.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <DialogFooter>
        {plan && (
          <Button
            type="button"
            variant="ghost"
            className="text-negative hover:text-negative sm:mr-auto"
            disabled={save.isPending}
            onClick={() => void persist(plans.filter((other) => other.id !== plan.id))}
          >
            Löschen
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={save.isPending || full}>
          {save.isPending ? "Wird gespeichert …" : plan ? "Speichern" : "Anlegen"}
        </Button>
      </DialogFooter>
    </form>
  );
}
