import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY muessen gesetzt sein (.env, siehe .env.example). " +
      "Der Anon/Publishable Key ist kein Geheimnis (durch RLS geschuetzt) und darf im Client " +
      "liegen; der Service-Role-Key darf hier niemals auftauchen (SECURITY_MODEL.md §5).",
  );
}

/**
 * Zentraler Supabase-Client (ARCHITECTURE.md §7). Einzige Instanz der App —
 * Feature-Code importiert ausschliesslich diesen Client, nie `createClient`
 * direkt, damit Auth-Konfiguration (PKCE) und Typisierung konsistent bleiben.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
