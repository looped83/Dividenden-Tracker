import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Gemeinsame Filterleiste (Statistik und Dividendenliste). Bewusst ein
 * geteiltes Primitive statt zweier Kopien, damit beide Bereiche dieselbe
 * Optik behalten, wenn sich eine davon aendert.
 */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Ein beschriftetes Filterfeld. `min-w-0` ist wesentlich: Ohne das waechst ein
 * `select` auf die Breite seiner laengsten Option (z. B. lange Firmennamen) und
 * sprengt die Zeile.
 */
export function FilterField({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 flex-1 basis-40 space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
