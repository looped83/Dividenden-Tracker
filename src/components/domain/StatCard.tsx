import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  /** Bereits formatierter Wert (z. B. via AmountText/formatMoney) — keine Berechnung hier. */
  value: ReactNode;
  /** Vergleichswert, z. B. "+4,2 % ggue. Vorjahr" (bereits formatiert). */
  comparison?: ReactNode;
  /** Drill-down auf die zugrunde liegenden Zahlungen (CALCULATION_RULES.md §6, Drill-down-Garantie). */
  onDrillDown?: () => void;
  className?: string;
}

/**
 * Statische Kennzahlkarte (UX_AND_DESIGN_SYSTEM.md #2 `StatCard`).
 * Reine Darstellungskomponente: Werte werden fertig formatiert uebergeben,
 * keine Aggregation/Rundung in der Komponente. Die Live-Verdrahtung mit
 * echten Kennzahlen folgt in Phase 5 (Dashboard und Statistiken).
 */
export function StatCard({
  label,
  value,
  comparison,
  onDrillDown,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="text-2xl font-semibold tabular-amount">{value}</div>
      {comparison !== undefined && (
        <div className="mt-1 text-sm text-muted-foreground">{comparison}</div>
      )}
    </>
  );

  return (
    <Card className={cn("text-left", className)}>
      <CardHeader className="pb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardHeader>
      <CardContent>
        {onDrillDown ? (
          <button
            type="button"
            onClick={onDrillDown}
            className="block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </button>
        ) : (
          <div className="block w-full text-left">{body}</div>
        )}
      </CardContent>
    </Card>
  );
}
