import { formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils/cn";

interface AmountTextProps {
  /** Bereits gerundeter Money-Wert — diese Komponente rundet niemals selbst. */
  money: Money;
  locale?: string;
  /**
   * "plain": neutrale Darstellung eines Betrags (z. B. Zahlungsliste).
   * "delta": Vergleichswert mit explizitem Vorzeichen und semantischer Farbe
   * (z. B. Veraenderung ggue. Vorjahr) — Bedeutung wird nie nur durch Farbe
   * vermittelt (UX_AND_DESIGN_SYSTEM.md #1).
   */
  variant?: "plain" | "delta";
  className?: string;
}

/**
 * Einheitliche Betragsdarstellung (UX_AND_DESIGN_SYSTEM.md #2 `AmountText`).
 * Nutzt ausschliesslich lib/money zur Formatierung — UI-Komponenten duerfen
 * keine eigenen abweichenden Berechnungs- oder Rundungsregeln enthalten.
 */
export function AmountText({
  money,
  locale = "de-DE",
  variant = "plain",
  className,
}: AmountTextProps) {
  const formatted = formatMoney(money, locale);
  const isNegative = money.isNegative();
  const isPositive = money.isPositive();

  const colorClass =
    variant === "delta"
      ? isNegative
        ? "text-negative"
        : isPositive
          ? "text-positive"
          : "text-muted-foreground"
      : isNegative
        ? "text-negative"
        : "text-foreground";

  const display = variant === "delta" && isPositive ? `+${formatted}` : formatted;

  return <span className={cn("tabular-amount", colorClass, className)}>{display}</span>;
}
