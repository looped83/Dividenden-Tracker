import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Einstellungen am eigenen Profil: Annahmen des Dividenden-Schneeballs
 * (Migration 0034) und Fixkosten des Fortschritts (Migration 0041).
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

export async function fetchForecastSettings(): Promise<Json | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("forecast_settings")
    .eq("id", await currentUserId())
    .single();
  if (error) throw error;
  return data.forecast_settings;
}

export async function updateForecastSettings(settings: Json): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ forecast_settings: settings })
    .eq("id", await currentUserId());
  if (error) throw error;
}

/** Fixkosten des Fortschritts am eigenen Profil (Migration 0041). */
export async function fetchFixedCosts(): Promise<Json | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("fixed_costs")
    .eq("id", await currentUserId())
    .single();
  if (error) throw error;
  return data.fixed_costs;
}

export async function updateFixedCosts(costs: Json): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ fixed_costs: costs })
    .eq("id", await currentUserId());
  if (error) throw error;
}

/** Sparpläne des Planers am eigenen Profil (Migration 0042). */
export async function fetchSavingsPlans(): Promise<Json | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("savings_plans")
    .eq("id", await currentUserId())
    .single();
  if (error) throw error;
  return data.savings_plans;
}

export async function updateSavingsPlans(plans: Json): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ savings_plans: plans })
    .eq("id", await currentUserId());
  if (error) throw error;
}

/** Positionsgrenzen je Asset am eigenen Profil (Migration 0043). */
export async function fetchPositionCaps(): Promise<Json | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("position_caps")
    .eq("id", await currentUserId())
    .single();
  if (error) throw error;
  return data.position_caps;
}

export async function updatePositionCaps(caps: Json): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ position_caps: caps })
    .eq("id", await currentUserId());
  if (error) throw error;
}
