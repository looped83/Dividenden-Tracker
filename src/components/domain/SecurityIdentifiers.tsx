import { CopyText } from "@/components/ui/copy-text";
import { cn } from "@/lib/utils/cn";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * ISIN, WKN und Ticker eines Assets, jeweils per Klick kopierbar — im Kopf der
 * Asset- und der Dividenden-Detailseite. Reihenfolge wie bei Banken und
 * Kursportalen. Ohne Trennpunkte: Das Kopiersymbol hinter jedem Wert trennt
 * schon, und beim Umbruch auf schmalen Telefonen bliebe sonst ein Punkt am
 * Zeilenende haengen. Ohne eine einzige Kennung entfaellt die Zeile ganz.
 */
export function SecurityIdentifiers({
  security,
  className,
}: {
  security: Pick<Security, "isin" | "wkn" | "ticker">;
  className?: string;
}) {
  const identifiers = (
    [
      ["ISIN", security.isin],
      ["WKN", security.wkn],
      ["Ticker", security.ticker],
    ] as const
  )
    .map(([label, value]) => [label, value?.trim() ?? ""] as const)
    .filter(([, value]) => value !== "");

  if (identifiers.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {identifiers.map(([label, value]) => (
        <CopyText key={label} label={label} value={value} />
      ))}
    </span>
  );
}
