import { formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils/cn";

interface AmountTextProps {
  amount: Money;
  /** Vorzeichen immer anzeigen, auch bei positiven Betraegen (z. B. Korrekturen). */
  showSign?: boolean;
  className?: string;
}

/**
 * Betragsdarstellung (UX_AND_DESIGN_SYSTEM.md #2): tabular-nums, semantische
 * Farbe je Vorzeichen, formatiert ausschliesslich ueber `formatMoney` — es
 * findet hier keine eigene Rundung statt (R-5).
 */
export function AmountText({ amount, showSign = false, className }: AmountTextProps) {
  const formatted = formatMoney(amount);
  const displayValue =
    showSign && amount.isPositive() && !formatted.startsWith("+")
      ? `+${formatted}`
      : formatted;

  return (
    <span
      className={cn(
        "tabular-nums",
        amount.isNegative() && "text-negative",
        amount.isPositive() && showSign && "text-positive",
        className,
      )}
    >
      {displayValue}
    </span>
  );
}
