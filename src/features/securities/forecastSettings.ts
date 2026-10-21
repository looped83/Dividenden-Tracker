import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MoneyDecimal, normalizeGermanDecimalInput } from "@/lib/money";
import {
  fetchForecastSettings,
  updateForecastSettings,
} from "@/lib/supabase/repositories/profiles";
import { DEFAULT_SNOWBALL_SETTINGS, type SnowballSettings } from "./snowball";

const FORECAST_SETTINGS_KEY = ["forecast-settings"] as const;

const percent = z.number().min(0).max(30);

/**
 * Form der gespeicherten Annahmen. Jedes Feld fuer sich: Ein ungueltiger oder
 * fehlender Wert (aeltere Fassung, Handeingriff) faellt auf seine Vorbelegung
 * zurueck, statt alle Eingaben zu verwerfen.
 */
const settingsSchema = z.object({
  monthlySavings: z
    .number()
    .min(0)
    .max(1_000_000)
    .catch(DEFAULT_SNOWBALL_SETTINGS.monthlySavings),
  reinvest: z.boolean().catch(DEFAULT_SNOWBALL_SETTINGS.reinvest),
  growthPercent: percent.nullable().catch(DEFAULT_SNOWBALL_SETTINGS.growthPercent),
  yieldPercent: percent.nullable().catch(DEFAULT_SNOWBALL_SETTINGS.yieldPercent),
  targetMonthly: z
    .number()
    .min(0)
    .max(1_000_000)
    .catch(DEFAULT_SNOWBALL_SETTINGS.targetMonthly),
  inflationPercent: percent.catch(DEFAULT_SNOWBALL_SETTINGS.inflationPercent),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .nullable()
    .catch(DEFAULT_SNOWBALL_SETTINGS.birthYear),
});

export function parseSnowballSettings(raw: unknown): SnowballSettings {
  if (raw === null || typeof raw !== "object") return DEFAULT_SNOWBALL_SETTINGS;
  return settingsSchema.parse({ ...DEFAULT_SNOWBALL_SETTINGS, ...raw });
}

export function useForecastSettings() {
  return useQuery({
    queryKey: FORECAST_SETTINGS_KEY,
    queryFn: fetchForecastSettings,
    select: parseSnowballSettings,
  });
}

/**
 * Speichert die Annahmen. Der Cache wird sofort gesetzt, damit die Rechnung
 * ohne Umlauf folgt; schlaegt das Speichern fehl, laedt die Abfrage den
 * gespeicherten Stand neu.
 */
export function useSaveForecastSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: SnowballSettings) => updateForecastSettings({ ...settings }),
    onMutate: (settings) => {
      queryClient.setQueryData(FORECAST_SETTINGS_KEY, { ...settings });
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: FORECAST_SETTINGS_KEY }),
  });
}

/**
 * Liest „1.000", „2,5" und „1.234,5". Ein Punkt ohne Komma gilt als
 * Tausendertrenner, wenn danach genau drei Ziffern folgen — so tippt man in
 * Deutschland Betraege. `null` fuer ein leeres Feld, `undefined` fuer Unsinn.
 */
export function parseGermanNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const canonical = /^\d{1,3}(\.\d{3})+$/.test(trimmed)
    ? trimmed.replace(/\./g, "")
    : normalizeGermanDecimalInput(trimmed);
  if (!/^\d+(\.\d+)?$/.test(canonical)) return undefined;
  return new MoneyDecimal(canonical).toNumber();
}
