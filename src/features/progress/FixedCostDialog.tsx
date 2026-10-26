import * as React from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
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
import {
  FIXED_COST_INTERVALS,
  fixedCost,
  type FixedCost,
  type FixedCostInterval,
} from "@/lib/progress";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  FIXED_COST_AMOUNT_MAX,
  FIXED_COST_NAME_MAX,
  FIXED_COSTS_MAX,
  newFixedCostId,
  useSaveFixedCosts,
} from "./hooks";
import { intervalLabel } from "./format";

/**
 * Eine Fixkostenposition anlegen oder bearbeiten (seit 2.14.0) — wie eine
 * Dividende oder ein Ziel: anlegen über „Neu", ändern und löschen auf der
 * Detailseite der Position. Gespeichert wird die ganze Liste mit der
 * geänderten Position.
 */
export function FixedCostDialog({
  open,
  onOpenChange,
  costs,
  cost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Die ganze gespeicherte Liste. */
  costs: readonly FixedCost[];
  /** Die bearbeitete Position; fehlt sie, entsteht eine neue. */
  cost?: FixedCost | undefined;
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
          // Tastatur auf. Der Dialog nimmt ihn selbst.
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{cost ? "Fixkosten bearbeiten" : "Neue Fixkosten"}</DialogTitle>
        </DialogHeader>
        {/* Der Inhalt entsteht bei jedem Öffnen neu und beginnt so mit dem
            gespeicherten Stand. */}
        <FixedCostForm costs={costs} cost={cost} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}

function FixedCostForm({
  costs,
  cost,
  onDone,
}: {
  costs: readonly FixedCost[];
  cost: FixedCost | undefined;
  onDone: () => void;
}) {
  const save = useSaveFixedCosts();
  const [name, setName] = React.useState(cost?.name ?? "");
  const [amount, setAmount] = React.useState(() =>
    cost ? toGermanAmountInput(cost.payment.toStringValue().replace(/\.00$/, "")) : "",
  );
  const [interval, setCostInterval] = React.useState<FixedCostInterval>(
    cost?.interval ?? 1,
  );
  const [error, setError] = React.useState<string | null>(null);
  const full = !cost && costs.length >= FIXED_COSTS_MAX;

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    const canonical = normalizeGermanDecimalInput(amount);
    if (trimmed === "") {
      setError("Gib einen Namen ein.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(canonical)) {
      setError("Gib einen Betrag ein.");
      return;
    }
    const value = new MoneyDecimal(canonical);
    if (value.lte(0) || value.gt(FIXED_COST_AMOUNT_MAX)) {
      setError("Der Betrag muss größer als 0 sein.");
      return;
    }
    const entry = fixedCost(
      cost?.id ?? newFixedCostId(),
      trimmed,
      Money.fromDecimal(value, EUR),
      interval,
    );
    setError(null);
    try {
      await save.mutateAsync(
        cost
          ? costs.map((other) => (other.id === cost.id ? entry : other))
          : [...costs, entry],
      );
      onDone();
    } catch (cause) {
      setError(getErrorMessage(cause, "Die Fixkosten konnten nicht gespeichert werden."));
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="fixed-cost-name">Name</Label>
        <Input
          id="fixed-cost-name"
          placeholder="z. B. Strom"
          maxLength={FIXED_COST_NAME_MAX}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
      </div>
      {/* Nebeneinander wie Jahr und Monat im Zieldialog: Der Betrag gilt je
          Fälligkeit, die Deckung rechnet ihn auf den Monat um (seit 2.34.0). */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fixed-cost-amount">Betrag (€)</Label>
          <AmountInput
            id="fixed-cost-amount"
            placeholder="z. B. 45,00"
            value={amount}
            onChange={(event) => {
              setAmount(event.currentTarget.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fixed-cost-interval">Rhythmus</Label>
          <Select
            id="fixed-cost-interval"
            value={String(interval)}
            onChange={(event) => {
              setCostInterval(
                Number.parseInt(event.target.value, 10) as FixedCostInterval,
              );
            }}
          >
            {FIXED_COST_INTERVALS.map((value) => (
              <option key={value} value={value}>
                {intervalLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {full && (
        <p role="alert" className="text-sm text-negative">
          Mehr als {FIXED_COSTS_MAX} Positionen sind nicht möglich.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={save.isPending || full}>
          {save.isPending ? "Wird gespeichert …" : cost ? "Speichern" : "Anlegen"}
        </Button>
      </DialogFooter>
    </form>
  );
}
