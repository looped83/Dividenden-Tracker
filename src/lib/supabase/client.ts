import { AuthClient } from "@supabase/auth-js";
import { FunctionsClient } from "@supabase/functions-js";
import { PostgrestClient } from "@supabase/postgrest-js";
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
 * Feature-Code importiert ausschliesslich diesen Client, damit
 * Auth-Konfiguration (PKCE) und Typisierung konsistent bleiben.
 *
 * Zusammengesetzt aus genau den Teilen, die die Anwendung nutzt — Anmeldung,
 * Datenbank (PostgREST) und Edge Functions — statt aus `createClient` von
 * `@supabase/supabase-js`. Das Sammelpaket bringt Realtime und Storage mit,
 * die hier nie gebraucht werden: rund 24 kB gepackt, gut ein Zehntel des
 * Startpakets, bei jedem Start geladen und geparst (ARCHITECTURE.md §7).
 * Die drei Pakete sind dieselben, die `createClient` intern verwendet, und
 * erscheinen im Gleichschritt — sie werden gemeinsam auf eine Version gehoben.
 *
 * Nachgebildet ist, was `createClient` fuer diese drei Teile tut: dieselbe
 * Adresse je Dienst, derselbe Speicherschluessel der Sitzung (bestehende
 * Anmeldungen bleiben gueltig) und dieselben Kopfzeilen je Anfrage.
 */
const baseUrl = new URL(supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`);

const auth = new AuthClient({
  url: new URL("auth/v1", baseUrl).href,
  headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
  // Wie supabase-js: `sb-<projekt>-auth-token`.
  storageKey: `sb-${baseUrl.hostname.split(".")[0] ?? ""}-auth-token`,
  flowType: "pkce",
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
});

/** Neue Schluesselform (`sb_publishable_…`); sie ist kein gueltiges Bearer-Token. */
const isNewApiKey = supabaseAnonKey.startsWith("sb_publishable_");

/**
 * `fetch` mit Schluessel und Sitzungstoken — wie `fetchWithAuth` in
 * supabase-js. Ohne Sitzung traegt der alte (JWT-)Anon-Key selbst als Bearer.
 * Der neue Schluessel ist kein JWT; Edge Functions pruefen den Bearer als JWT,
 * deshalb bleibt er dort weg.
 */
function authorizedFetch(keyAsBearer: boolean): typeof fetch {
  return async (input, init) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init?.headers);
    if (!headers.has("apikey")) headers.set("apikey", supabaseAnonKey);
    if (!headers.has("Authorization")) {
      const bearer = data.session?.access_token ?? (keyAsBearer ? supabaseAnonKey : null);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    }
    return fetch(input, { ...init, headers });
  };
}

// `PostgrestVersion: "12"` wie `createClient`, solange die generierten Typen
// keine eigene Angabe tragen — sonst verhielten sich die Abfragetypen anders.
const rest = new PostgrestClient<Database, { PostgrestVersion: "12" }>(
  new URL("rest/v1", baseUrl).href,
  { fetch: authorizedFetch(true) },
);

export const supabase = {
  auth,
  from: rest.from.bind(rest),
  rpc: rest.rpc.bind(rest),
  functions: new FunctionsClient(new URL("functions/v1", baseUrl).href, {
    customFetch: authorizedFetch(!isNewApiKey),
  }),
};
