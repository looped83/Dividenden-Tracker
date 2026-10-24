import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  EUR,
  Money,
  MoneyDecimal,
  normalizeGermanDecimalInput,
  toGermanAmountInput,
} from "@/lib/money";
import type { FixedCost } from "@/lib/progress";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  FIXED_COST_AMOUNT_MAX,
  FIXED_COST_NAME_MAX,
  FIXED_COSTS_MAX,
  useSaveFixedCosts,
} from "./hooks";

interface Row {
  key: number;
  name: string;
  amount: string;
}

let nextKey = 0;
const row = (name = "", amount = ""): Row => ({ key: (nextKey += 1), name, amount });

function toRows(costs: readonly FixedCost[]): Row[] {
  const rows = costs.map((cost) =>
    row(cost.name, toGermanAmountInput(cost.amount.toStringValue().replace(/\.00$/, ""))),
  );
  return rows.length > 0 ? rows : [row()];
}

/** Liest die Zeilen; leere Zeilen fallen weg. `string` ist die Fehlermeldung. */
function toCosts(rows: readonly Row[]): FixedCost[] | string {
  const costs: FixedCost[] = [];
  for (const { name, amount } of rows) {
    const trimmed = name.trim();
    if (trimmed === "" && amount.trim() === "") continue;
    if (trimmed === "") return "Jede Position braucht einen Namen.";
    const canonical = normalizeGermanDecimalInput(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(canonical)) return `Betrag für „${trimmed}“ fehlt.`;
    const value = new MoneyDecimal(canonical);
    if (value.lte(0) || value.gt(FIXED_COST_AMOUNT_MAX)) {
      return `Betrag für „${trimmed}“ muss größer als 0 sein.`;
    }
    costs.push({ name: trimmed, amount: Money.fromDecimal(value, EUR) });
  }
  return costs;
}

/**
 * Fixkosten bearbeiten: eine Zeile je Position, Name und Monatsbetrag. Alle
 * Positionen in einem Dialog statt einzeln anlegen — die Liste ist kurz und
 * wird einmal eingerichtet.
 */
export function FixedCostsDialog({
  open,
  onOpenChange,
  costs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costs: readonly FixedCost[];
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
          // Tastatur auf und verdeckte die Liste. Der Dialog nimmt ihn selbst.
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Fixkosten im Monat</DialogTitle>
        </DialogHeader>
        {/* Der Inhalt entsteht bei jedem Öffnen neu und beginnt so mit der
            gespeicherten Liste. */}
        <FixedCostsForm costs={costs} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}

function FixedCostsForm({
  costs,
  onDone,
}: {
  costs: readonly FixedCost[];
  onDone: () => void;
}) {
  const save = useSaveFixedCosts();
  const [rows, setRows] = React.useState<Row[]>(() => toRows(costs));
  const [error, setError] = React.useState<string | null>(null);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = toCosts(rows);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync(parsed);
      onDone();
    } catch (cause) {
      setError(getErrorMessage(cause, "Die Fixkosten konnten nicht gespeichert werden."));
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <ul className="space-y-2">
        {rows.map((r, index) => (
          <li key={r.key} className="flex items-center gap-2">
            <Input
              aria-label={`Name der Position ${String(index + 1)}`}
              placeholder="z. B. Strom"
              maxLength={FIXED_COST_NAME_MAX}
              value={r.name}
              onChange={(event) => {
                update(r.key, { name: event.currentTarget.value });
              }}
              className="min-w-0 flex-1"
            />
            <AmountInput
              aria-label={`Monatsbetrag der Position ${String(index + 1)} in Euro`}
              placeholder="€"
              value={r.amount}
              onChange={(event) => {
                update(r.key, { amount: event.currentTarget.value });
              }}
              className="w-24 shrink-0 text-right sm:w-28"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Position ${String(index + 1)} entfernen`}
              onClick={() => {
                setRows((current) => {
                  const rest = current.filter((other) => other.key !== r.key);
                  return rest.length > 0 ? rest : [row()];
                });
              }}
              className="shrink-0 text-muted-foreground"
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {rows.length < FIXED_COSTS_MAX && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRows((current) => [...current, row()]);
          }}
        >
          <Plus aria-hidden /> Position hinzufügen
        </Button>
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
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Wird gespeichert …" : "Speichern"}
        </Button>
      </DialogFooter>
    </form>
  );
}
