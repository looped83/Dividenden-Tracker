import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/**
 * Raster der Kennzahlkacheln: zwei Spalten schon auf dem Telefon, vier ab
 * `lg` (bei sechs Kacheln drei, damit keine Reihe halb leer bleibt).
 *
 * Die Kacheln einer Reihe teilen sich ihre Zeilen (CSS-Subgrid): Beschriftung,
 * Kennzahl und Zusatz stehen nebeneinander auf derselben Linie, auch wenn eine
 * Beschriftung umbricht und die daneben nicht. Zuvor reservierte jede Kachel
 * dafuer zwei Zeilen Beschriftung und schob die Kennzahl in die Mitte — auf
 * dem Telefon blieben so in jeder Kachel rund 40px leer.
 */
export function StatGrid({
  columns = 4,
  className,
  children,
}: {
  columns?: 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  /** Bereits formatierter Wert (z. B. via AmountText/formatMoney) — keine Berechnung hier. */
  value: ReactNode;
  /** Zusatzangabe am Kachelboden: Vergleich, Zeitraum, Anzahl (bereits formatiert). */
  caption?: ReactNode;
  /** Drill-down als Link (CALCULATION_RULES.md §6, Drill-down-Garantie). */
  to?: string | undefined;
  /** Drill-down als Aktion, wenn das Ziel erst beim Antippen entsteht. */
  onDrillDown?: () => void;
  /** Name des Drill-downs fuer Screenreader, sonst die Beschriftung. */
  drillLabel?: string | undefined;
  /** Nur fuer die Lage im Raster (z. B. `col-span-2`). */
  className?: string;
}

/**
 * Kennzahlkachel (UX_AND_DESIGN_SYSTEM.md #2 `StatCard`) — **eine** fuer alle
 * Bereiche. Die Uebersicht hatte eine eigene Fassung mit anderem Aufbau;
 * dieselbe Sache sah dadurch zwei Bildschirme weiter anders aus.
 *
 * Reine Darstellungskomponente: Werte werden fertig formatiert uebergeben,
 * keine Aggregation/Rundung in der Komponente.
 *
 * **Die ganze Kachel ist die Tippflaeche** eines Drill-downs: Der Link liegt
 * auf der Kennzahl und dehnt sich per `::after` ueber die Kachel. Zuvor war
 * nur die Zahl antippbar — 28px hoch, unter der Mindestgroesse von 44px.
 */
export function StatCard({
  label,
  value,
  caption,
  to,
  onDrillDown,
  drillLabel,
  className,
}: StatCardProps) {
  const drillable = to !== undefined || onDrillDown !== undefined;
  const valueClass = "text-lg font-semibold tabular-amount sm:text-2xl";
  const stretched = cn(
    "block rounded-sm text-left outline-none",
    "after:absolute after:inset-0 after:rounded-lg",
    "focus-visible:after:ring-2 focus-visible:after:ring-ring",
  );

  return (
    <Card
      className={cn(
        // Drei Zeilen des Rasters (Subgrid): Beschriftung, Kennzahl, Zusatz.
        "relative row-span-3 grid grid-rows-subgrid gap-y-1 p-4 sm:p-6",
        drillable &&
          "transition-colors hover:bg-accent/50 active:bg-accent motion-reduce:transition-none",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      {to !== undefined ? (
        <Link
          to={to}
          aria-label={drillLabel ?? label}
          className={cn(valueClass, stretched)}
        >
          {value}
        </Link>
      ) : onDrillDown ? (
        <button
          type="button"
          onClick={onDrillDown}
          aria-label={drillLabel}
          className={cn(valueClass, stretched, "w-full")}
        >
          {value}
        </button>
      ) : (
        <div className={valueClass}>{value}</div>
      )}
      {/* Der Zusatz steht am Kachelboden: Seine Zeile teilt er mit den
          Nachbarkacheln, auch wenn deren Kennzahl zwei Zeilen braucht. */}
      <div className="self-end pt-1 text-xs text-muted-foreground">{caption}</div>
    </Card>
  );
}
