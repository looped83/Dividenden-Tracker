import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Einstellungen am eigenen Profil: Annahmen des Dividenden-Schneeballs
 * (Migration 0034), Fixkosten des Fortschritts (0041), Sparplaene (0042) und
 * Gewichtungen je Asset (0043).
 *
 * Gefiltert wird ueber die Kennung der lokalen Sitzung, nicht ueber
 * `getUser()` — das kostete einen Umlauf zum Auth-Server. Welche Zeile gelesen
 * und geschrieben werden darf, entscheidet ohnehin RLS (`profiles.id = auth.uid()`).
 */
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Nicht angemeldet.");
  return id;
}

/** Die JSON-Spalten des Profils, die jeweils einen Bereich der App tragen. */
type SettingsColumn =
  "forecast_settings" | "fixed_costs" | "savings_plans" | "position_caps";

/**
 * Liest genau eine Spalte — je Bereich ein eigener Cache-Eintrag, damit ein
 * Speichern der Sparplaene nicht die Fixkosten neu laedt.
 */
async function fetchSetting(column: SettingsColumn): Promise<Json | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(column)
    .eq("id", await currentUserId())
    .single();
  if (error) throw error;
  // Der Ergebnistyp einer zur Laufzeit gewaehlten Spalte ist fuer PostgREST
  // nicht ableitbar; alle vier Spalten sind `jsonb`.
  return (data as Record<SettingsColumn, Json | null>)[column];
}

async function updateSetting(column: SettingsColumn, value: Json): Promise<void> {
  // Typisiert statt inline: Einen berechneten Schluessel weitet TypeScript zur
  // Indexsignatur, die PostgREST als ueberzaehlige Spalte ablehnt.
  const patch: Partial<Record<SettingsColumn, Json>> = { [column]: value };
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", await currentUserId());
  if (error) throw error;
}

export const fetchForecastSettings = () => fetchSetting("forecast_settings");
export const updateForecastSettings = (settings: Json) =>
  updateSetting("forecast_settings", settings);

export const fetchFixedCosts = () => fetchSetting("fixed_costs");
export const updateFixedCosts = (costs: Json) => updateSetting("fixed_costs", costs);

export const fetchSavingsPlans = () => fetchSetting("savings_plans");
export const updateSavingsPlans = (plans: Json) => updateSetting("savings_plans", plans);

export const fetchPositionCaps = () => fetchSetting("position_caps");
export const updatePositionCaps = (caps: Json) => updateSetting("position_caps", caps);
