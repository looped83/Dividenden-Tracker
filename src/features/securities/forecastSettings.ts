import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MoneyDecimal, normalizeGermanDecimalInput } from "@/lib/money";
import {
  fetchForecastSettings,
  updateForecastSettings,
} from "@/lib/supabase/repositories/profiles";
import { DEFAULT_SNOWBALL_SETTINGS, type SnowballSettings } from "./snowball";

const FORECAST_SETTINGS_KEY = ["forecast-settings"] as const;

/**
 * Obergrenzen der Annahmen. Die Eingabefelder pruefen gegen dieselben Werte:
 * Was das Schema hier verwirft, faellt beim Lesen auf die Vorbelegung zurueck
 * — das Feld zeigte sonst die Eingabe, waehrend mit etwas anderem gerechnet
 * wird.
 */
export const PERCENT_MAX = 30;
export const AMOUNT_MAX = 1_000_000;

const percent = z.number().min(0).max(PERCENT_MAX);

/**
 * Form der gespeicherten Annahmen. Jedes Feld fuer sich: Ein ungueltiger oder
 * fehlender Wert (aeltere Fassung, Handeingriff) faellt auf seine Vorbelegung
 * zurueck, statt alle Eingaben zu verwerfen.
 */
const settingsSchema = z.object({
  monthlySavings: z
    .number()
    .min(0)
    .max(AMOUNT_MAX)
    .catch(DEFAULT_SNOWBALL_SETTINGS.monthlySavings),
  reinvest: z.boolean().catch(DEFAULT_SNOWBALL_SETTINGS.reinvest),
  growthPercent: percent.nullable().catch(DEFAULT_SNOWBALL_SETTINGS.growthPercent),
  yieldPercent: percent.nullable().catch(DEFAULT_SNOWBALL_SETTINGS.yieldPercent),
  targetMonthly: z
    .number()
    .min(0)
    .max(AMOUNT_MAX)
    .catch(DEFAULT_SNOWBALL_SETTINGS.targetMonthly),
  inflationPercent: percent.catch(DEFAULT_SNOWBALL_SETTINGS.inflationPercent),
});

export function parseSnowballSettings(raw: unknown): SnowballSettings {
  if (raw === null || typeof raw !== "object") return DEFAULT_SNOWBALL_SETTINGS;
  return settingsSchema.parse({ ...DEFAULT_SNOWBALL_SETTINGS, ...raw });
}

/**
 * Annahmen des Schneeballs und die vom Nachkauf-Planer ausgeschlossenen Assets
 * (CALCULATION_RULES.md §16) — eine Zeile, eine Spalte (`forecast_settings`),
 * damit dafuer keine Migration noetig ist. Die Obergrenze haelt die Spalte
 * unter ihrer Groessenpruefung (0034: 2 KB).
 */
export interface ForecastSettings extends SnowballSettings {
  excluded: readonly string[];
  /** Höchstens so viel Prozent des Depots je Position nach einem Nachkauf. */
  positionCap: number;
}

export const EXCLUDED_MAX = 30;

/** Positionsgrenze des Nachkaufs in Prozent (CALCULATION_RULES.md §16, seit 2.22.0). */
export const POSITION_CAP_DEFAULT = 8;
export const POSITION_CAP_MIN = 5;
export const POSITION_CAP_MAX = 15;

export const DEFAULT_FORECAST_SETTINGS: ForecastSettings = {
  ...DEFAULT_SNOWBALL_SETTINGS,
  excluded: [],
  positionCap: POSITION_CAP_DEFAULT,
};

const excludedSchema = z.array(z.guid()).max(EXCLUDED_MAX).catch([]);
const positionCapSchema = z
  .number()
  .min(POSITION_CAP_MIN)
  .max(POSITION_CAP_MAX)
  .catch(POSITION_CAP_DEFAULT);

export function parseForecastSettings(raw: unknown): ForecastSettings {
  const fields = raw !== null && typeof raw === "object" ? raw : {};
  const excluded = "excluded" in fields ? excludedSchema.parse(fields.excluded) : [];
  const positionCap =
    "positionCap" in fields
      ? positionCapSchema.parse(fields.positionCap)
      : POSITION_CAP_DEFAULT;
  return { ...parseSnowballSettings(raw), excluded, positionCap };
}

export function useForecastSettings() {
  return useQuery({
    queryKey: FORECAST_SETTINGS_KEY,
    queryFn: fetchForecastSettings,
    select: parseForecastSettings,
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
    mutationFn: (settings: ForecastSettings) =>
      updateForecastSettings({ ...settings, excluded: [...settings.excluded] }),
    onMutate: (settings) => {
      queryClient.setQueryData(FORECAST_SETTINGS_KEY, {
        ...settings,
        excluded: [...settings.excluded],
      });
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: FORECAST_SETTINGS_KEY }),
  });
}

/**
 * Liest „1.000", „2,5" und „1.234,5" (normalizeGermanDecimalInput). `null` fuer ein leeres Feld, `undefined` fuer Unsinn.
 */
export function parseGermanNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const canonical = normalizeGermanDecimalInput(trimmed);
  if (!/^\d+(\.\d+)?$/.test(canonical)) return undefined;
  return new MoneyDecimal(canonical).toNumber();
}
