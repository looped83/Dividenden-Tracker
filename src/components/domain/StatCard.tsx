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
 * keine Aggregation/Rundung in der Komponente.
 *
 * **Die Zusatzzeile sitzt am Kachelboden**, nicht direkt unter der Kennzahl —
 * dieselbe Regel wie in den Kacheln der Uebersicht. Stehen zwei Kacheln
 * nebeneinander und braucht die eine Kennzahl zwei Zeilen (ein Zeitraum, ein
 * langer Betrag), saessen die Zusatzzeilen sonst auf verschiedenen Hoehen; in
 * einem Raster faellt das sofort als Unruhe auf. Auf dem Telefon steht die
 * Zusatzzeile eine Stufe kleiner: In halber Breite geriete sie sonst laenger
 * als die Kennzahl darueber.
 */
export function StatCard({
  label,
  value,
  comparison,
  onDrillDown,
  className,
}: StatCardProps) {
  const body = (
    <div className="text-lg font-semibold tabular-amount sm:text-2xl">{value}</div>
  );

  return (
    <Card className={cn("flex flex-col text-left", className)}>
      <CardHeader className="pb-2 sm:pb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-2">
        {onDrillDown ? (
          <button
            type="button"
            onClick={onDrillDown}
            className="block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </button>
        ) : (
          body
        )}
        {comparison !== undefined && (
          <div className="text-xs text-muted-foreground sm:text-sm">{comparison}</div>
        )}
      </CardContent>
    </Card>
  );
}
