import * as React from "react";
import { Input } from "@/components/ui/input";
import { applyAmountInput } from "@/lib/money";

type AmountInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "inputMode"> & {
  /** Hoechstens so viele Nachkommastellen; mehr getippte fallen weg. */
  maxFractionDigits?: number;
};

/**
 * Betragsfeld mit deutschem Tausenderpunkt („1.500,00“), der schon beim
 * Tippen erscheint. Funktioniert mit `register` (das Feld bekommt den
 * formatierten Wert, bevor react-hook-form ihn liest) wie mit `value`.
 * Zum Speichern liest normalizeGermanDecimalInput den Text zurueck.
 */
export function AmountInput({
  onChange,
  maxFractionDigits = 2,
  ...props
}: AmountInputProps) {
  return (
    <Input
      autoComplete="off"
      {...props}
      type="text"
      inputMode="decimal"
      onChange={(event) => {
        const input = event.currentTarget;
        const native = event.nativeEvent as InputEvent;
        const inserted = native.inputType.startsWith("insert")
          ? (native.data ?? "")
          : null;
        const next = applyAmountInput(
          input.value,
          input.selectionStart ?? input.value.length,
          inserted,
          maxFractionDigits,
        );
        if (next.value !== input.value) {
          input.value = next.value;
          if (document.activeElement === input)
            input.setSelectionRange(next.caret, next.caret);
        }
        onChange?.(event);
      }}
    />
  );
}
