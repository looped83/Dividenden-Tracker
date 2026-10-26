import { formatCountNoun } from "@/lib/utils/formatNumber";
import type { ForecastSettings } from "@/features/securities/forecastSettings";

/**
 * Die Annahmen des Schneeballs, wie er selbst rechnet: Die gepflegten
 * Sparpläne (§17) kommen zur Sparrate hinzu — sie steht seit 2.33.0 für das,
 * was du **zusätzlich** im Monat anlegst, etwa Einmalkäufe (bis 2.32 galten
 * die Pläne nur bei leerer Sparrate). Eine Stelle für Schneeball, Nachkauf
 * und Sparpläne, damit „früher am Ziel" überall dasselbe Ziel meint.
 */
export function withPlanSavings(
  stored: ForecastSettings,
  planSavings: number,
): ForecastSettings {
  return planSavings > 0
    ? { ...stored, monthlySavings: stored.monthlySavings + planSavings }
    : stored;
}

/** „4 Monate", „1 Jahr", „2 Jahre 3 Monate". */
export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 ? formatCountNoun(years, "Jahr", "Jahre") : null,
    rest > 0 ? formatCountNoun(rest, "Monat", "Monate") : null,
  ].filter((part) => part !== null);
  return parts.join(" ");
}
