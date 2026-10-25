import * as React from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  EUR,
  Money,
  MoneyDecimal,
  normalizeGermanDecimalInput,
  toGermanAmountInput,
} from "@/lib/money";
import { compareGerman } from "@/lib/utils/compareText";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import { newSavingsPlanId, useSaveSavingsPlans } from "./savingsPlanHooks";
import {
  INTERVAL_LABEL,
  SAVINGS_PLAN_AMOUNT_MAX,
  SAVINGS_PLANS_MAX,
  type SavingsInterval,
  type SavingsPlan,
} from "./savingsPlans";

/**
 * Einen Sparplan anlegen, ändern oder löschen (seit 2.21.0) — aus Planer ›
 * Sparpläne oder von der Seite des Assets. Gespeichert wird die ganze Liste
 * mit dem geänderten Plan (wie die Fixkosten).
 */
export function SavingsPlanDialog({
  open,
  onOpenChange,
  plans,
  plan,
  securityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Die ganze gespeicherte Liste. */
  plans: readonly SavingsPlan[];
  /** Der bearbeitete Plan; fehlt er, entsteht ein neuer. */
  plan?: SavingsPlan | undefined;
  /** Fest vorgegebenes Asset (Asset-Seite); sonst wählbar. */
  securityId?: string | undefined;
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
        <SavingsPlanForm
          plans={plans}
          plan={plan}
          securityId={securityId}
          onDone={close}
        />
      </DialogContent>
    </Dialog>
  );
}

function SavingsPlanForm({
  plans,
  plan,
  securityId: fixedSecurityId,
  onDone,
}: {
  plans: readonly SavingsPlan[];
  plan: SavingsPlan | undefined;
  securityId: string | undefined;
  onDone: () => void;
}) {
  const save = useSaveSavingsPlans();
  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const fixed = fixedSecurityId ?? plan?.securityId;
  const [securityId, setSecurityId] = React.useState(fixed ?? "");
  const [amount, setAmount] = React.useState(() =>
    plan ? toGermanAmountInput(plan.amount.toStringValue().replace(/\.00$/, "")) : "",
  );
  const [interval, setInterval] = React.useState<SavingsInterval>(
    plan?.interval ?? "monthly",
  );
  const [nextDate, setNextDate] = React.useState(plan?.nextDate ?? "");
  const defaultDepot = securities.find((entry) => entry.id === fixed)?.default_depot_id;
  const [depotId, setDepotId] = React.useState(plan?.depotId ?? defaultDepot ?? "");
  const [paused, setPaused] = React.useState(plan?.paused ?? false);
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
    const canonical = normalizeGermanDecimalInput(amount);
    if (securityId === "") {
      setError("Wähle ein Asset.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(canonical)) {
      setError("Gib eine Rate ein.");
      return;
    }
    const value = new MoneyDecimal(canonical);
    if (value.lte(0) || value.gt(SAVINGS_PLAN_AMOUNT_MAX)) {
      setError("Die Rate muss größer als 0 sein.");
      return;
    }
    const entry: SavingsPlan = {
      id: plan?.id ?? newSavingsPlanId(),
      securityId,
      depotId: depotId === "" ? null : depotId,
      amount: Money.fromDecimal(value, EUR),
      interval,
      nextDate: nextDate === "" ? null : nextDate,
      paused,
    };
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
              if (depotId === "" && chosen?.default_depot_id)
                setDepotId(chosen.default_depot_id);
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="savings-plan-amount">Rate (€)</Label>
          <AmountInput
            id="savings-plan-amount"
            placeholder="z. B. 100"
            value={amount}
            onChange={(event) => {
              setAmount(event.currentTarget.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="savings-plan-interval">Rhythmus</Label>
          <Select
            id="savings-plan-interval"
            value={interval}
            onChange={(event) => {
              setInterval(event.target.value as SavingsInterval);
            }}
          >
            {(Object.keys(INTERVAL_LABEL) as SavingsInterval[]).map((key) => (
              <option key={key} value={key}>
                {INTERVAL_LABEL[key][0].toUpperCase() + INTERVAL_LABEL[key].slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="savings-plan-date">Nächste Ausführung</Label>
          <Input
            id="savings-plan-date"
            type="date"
            value={nextDate}
            onChange={(event) => {
              setNextDate(event.currentTarget.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="savings-plan-depot">Depot</Label>
          <Select
            id="savings-plan-depot"
            value={depotId}
            onChange={(event) => {
              setDepotId(event.target.value);
            }}
          >
            <option value="">Kein Depot</option>
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox
          checked={paused}
          onCheckedChange={(checked) => {
            setPaused(checked === true);
          }}
        />
        Pausiert
      </label>

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
