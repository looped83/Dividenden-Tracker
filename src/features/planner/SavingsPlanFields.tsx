import { AmountInput } from "@/components/ui/amount-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useDepots } from "@/features/depots/hooks";
import { INTERVAL_LABEL, type SavingsInterval } from "./savingsPlans";
import type { SavingsPlanDraft } from "./savingsPlanDraft";

/**
 * Felder eines Sparplans (seit 2.44.0 geteilt): im Dialog unter Planer ›
 * Sparpläne und im Formular „Asset bearbeiten".
 */
export function SavingsPlanFields({
  idPrefix,
  draft,
  onChange,
}: {
  /** Eindeutig je Plan, damit Beschriftungen ihr Feld finden. */
  idPrefix: string;
  draft: SavingsPlanDraft;
  onChange: (next: SavingsPlanDraft) => void;
}) {
  const { data: depots = [] } = useDepots();
  const set = (patch: Partial<SavingsPlanDraft>) => {
    onChange({ ...draft, ...patch });
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-amount`}>Rate (€)</Label>
          <AmountInput
            id={`${idPrefix}-amount`}
            placeholder="z. B. 100"
            value={draft.amount}
            onChange={(event) => {
              set({ amount: event.currentTarget.value });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-interval`}>Rhythmus</Label>
          <Select
            id={`${idPrefix}-interval`}
            value={draft.interval}
            onChange={(event) => {
              set({ interval: event.target.value as SavingsInterval });
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
          <Label htmlFor={`${idPrefix}-date`}>Nächste Ausführung</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={draft.nextDate}
            onChange={(event) => {
              set({ nextDate: event.currentTarget.value });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-depot`}>Depot</Label>
          <Select
            id={`${idPrefix}-depot`}
            value={draft.depotId}
            onChange={(event) => {
              set({ depotId: event.target.value });
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
          checked={draft.paused}
          onCheckedChange={(checked) => {
            set({ paused: checked === true });
          }}
        />
        Pausiert
      </label>
    </div>
  );
}
