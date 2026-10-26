import { formatCountNoun } from "@/lib/utils/formatNumber";
import type { ForecastSettings } from "@/features/securities/forecastSettings";

/**
 * Die Annahmen des Schneeballs, wie er selbst rechnet: Ohne eigene Sparrate
 * gilt die Summe der gepflegten Sparpläne (§17). Eine Stelle für Schneeball,
 * Nachkauf und Sparpläne, damit „früher am Ziel" überall dasselbe Ziel meint.
 */
export function withPlanSavings(
  stored: ForecastSettings,
  planSavings: number,
): { settings: ForecastSettings; fromPlans: boolean } {
  const fromPlans = stored.monthlySavings === 0 && planSavings > 0;
  return {
    settings: fromPlans ? { ...stored, monthlySavings: planSavings } : stored,
    fromPlans,
  };
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
