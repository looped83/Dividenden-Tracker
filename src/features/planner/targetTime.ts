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

/**
 * Ab wann „früher am Ziel" gezeigt wird: ein Tag. Darunter ist der Vorsprung
 * Rechenrauschen.
 */
export const MIN_GAIN_MONTHS = 12 / 365;

/**
 * „3 Tage", „2 Wochen", „4 Monate", „1 Jahr", „2 Jahre 3 Monate". Ab einem
 * Monat auf ganze Monate gerundet, darunter in Wochen oder Tagen, damit auch
 * ein kleiner Kauf zeigt, was er bringt.
 */
export function formatMonths(months: number): string {
  if (months < 1) {
    const weeks = Math.round((months * 52) / 12);
    if (weeks >= 1) return formatCountNoun(weeks, "Woche", "Wochen");
    const days = Math.max(1, Math.round((months * 365) / 12));
    return formatCountNoun(days, "Tag", "Tage");
  }
  const whole = Math.round(months);
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const parts = [
    years > 0 ? formatCountNoun(years, "Jahr", "Jahre") : null,
    rest > 0 ? formatCountNoun(rest, "Monat", "Monate") : null,
  ].filter((part) => part !== null);
  return parts.join(" ");
}
