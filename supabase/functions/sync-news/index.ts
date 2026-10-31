/**
 * Edge Function `sync-news` — holt Meldungen zu den Aktien im Bestand von
 * Marketaux und schreibt sie nach `news_items`. GDELT fragt der Browser
 * selbst (`src/lib/news/gdelt.ts`).
 *
 * Laufzeit: Deno (Supabase Edge Runtime). Abruf und Auswertung stehen in
 * `../_shared/news.ts` und werden von den Unit-Tests des Projekts geprüft.
 *
 * Sicherheit (SECURITY_MODEL.md „News“):
 * - Der API-Key steht ausschließlich im Secret `MARKETAUX_API_KEY`; weder
 *   Antwort noch Log enthalten ihn oder eine Anfrageadresse.
 * - Die Nutzerkennung stammt aus dem geprüften JWT, nie aus dem Anfragekörper.
 * - Geschrieben wird mit service_role; jede Anweisung filtert zusätzlich auf
 *   diese Kennung.
 *
 * Kontingent: `claim_news_sync` lässt höchstens alle 12 Stunden einen Lauf zu.
 * Bei rund 40 Aktien bleibt Marketaux so unter 100 Anfragen am Tag. Ein zu
 * früher Aufruf antwortet mit `fresh` und fragt keine Quelle an.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  NEWS_LOOKBACK_DAYS,
  NEWS_RETENTION_DAYS,
  collectNews,
  type NewsSecurity,
} from "../_shared/news.ts";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

const GENERIC_ERROR =
  "Die News konnten gerade nicht aktualisiert werden. Die zuletzt gespeicherten Meldungen werden weiterhin angezeigt.";

const DAY_MS = 86_400_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Assets im Bestand: die Positionen des jüngsten Depotstands mit Stückzahl
 * über null. Ohne Depotstand gibt es keinen Bestand — und keine News.
 */
async function loadHoldings(
  admin: SupabaseClient,
  userId: string,
): Promise<NewsSecurity[]> {
  const { data: run, error: runError } = await admin
    .from("security_snapshot_runs")
    .select("id")
    .eq("user_id", userId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new Error("holdings:run");
  if (!run) return [];

  const { data, error } = await admin
    .from("security_snapshots")
    .select("asset_type, securities!inner(id, name, ticker, isin, archived_at)")
    .eq("user_id", userId)
    .eq("run_id", run.id)
    .gt("quantity", 0);
  if (error) throw new Error("holdings:snapshots");

  type Row = {
    asset_type: string | null;
    securities: {
      id: string;
      name: string;
      ticker: string | null;
      isin: string | null;
      archived_at: string | null;
    };
  };
  return (data as unknown as Row[])
    .filter((row) => row.securities.archived_at === null)
    .map((row) => ({
      id: row.securities.id,
      name: row.securities.name,
      ticker: row.securities.ticker,
      isin: row.securities.isin,
      isEquity: row.asset_type === "equity",
    }));
}

/** „marketaux:http:429×3,marketaux:timeout“ — Anzahl je Fehlercode fürs Log. */
function countCodes(codes: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts]
    .map(([code, n]) => (n > 1 ? `${code}×${String(n)}` : code))
    .join(",");
}

async function finish(
  admin: SupabaseClient,
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("news_sync_status")
    .update(fields)
    .eq("user_id", userId);
  if (error) console.error("news-sync: status_update_failed");
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ status: "error", message: "Methode nicht erlaubt." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("news-sync: missing_runtime_configuration");
    return json({ status: "error", message: GENERIC_ERROR }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json({ status: "error", message: "Nicht angemeldet." }, 401);
  }
  const asUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return json({ status: "error", message: "Nicht angemeldet." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Letzten Erfolg vor dem Belegen lesen: Er bestimmt, ab wann gesucht wird.
  const { data: previous } = await admin
    .from("news_sync_status")
    .select("last_success_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: claimed, error: claimError } = await admin.rpc("claim_news_sync", {
    p_user_id: userId,
  });
  if (claimError) {
    console.error("news-sync: claim_failed");
    return json({ status: "error", message: GENERIC_ERROR }, 500);
  }
  if (claimed !== true) {
    return json({ status: "fresh" }, 200);
  }

  const now = new Date();
  const lastSuccess = previous?.last_success_at
    ? Date.parse(previous.last_success_at)
    : Number.NaN;
  // Eine Stunde Überlappung: Anbieter stellen Meldungen teils verspätet ein.
  const since = new Date(
    Math.max(
      now.getTime() - NEWS_LOOKBACK_DAYS * DAY_MS,
      Number.isFinite(lastSuccess) ? lastSuccess - 3_600_000 : 0,
    ),
  );

  try {
    const securities = await loadHoldings(admin, userId);
    const result = await collectNews({
      securities,
      since,
      marketauxKey: Deno.env.get("MARKETAUX_API_KEY") ?? null,
    });

    if (result.requests > 0 && result.failed === result.requests) {
      throw new Error(`sources:${result.errorCodes.slice(0, 3).join(",")}`);
    }

    if (result.items.length > 0) {
      const { error } = await admin.from("news_items").upsert(
        result.items.map((item) => ({ ...item, user_id: userId })),
        {
          onConflict: "user_id,security_id,provider,external_id",
          ignoreDuplicates: true,
        },
      );
      if (error) throw new Error(`store:insert ${String(error.code ?? "")}`);
    }

    const { error: pruneError } = await admin
      .from("news_items")
      .delete()
      .eq("user_id", userId)
      .lt(
        "published_at",
        new Date(now.getTime() - NEWS_RETENTION_DAYS * DAY_MS).toISOString(),
      );
    if (pruneError) console.error("news-sync: prune_failed");

    const nowIso = now.toISOString();
    await finish(admin, userId, { last_success_at: nowIso, error_message: null });

    // Nur Zähler und Fehlercodes — keine Adresse, kein Key, keine Titel.
    console.log(
      `news-sync: ok ms=${String(Date.now() - now.getTime())} assets=${String(securities.length)} req=${String(result.requests)} failed=${String(result.failed)} skipped=${String(result.skipped)} items=${String(result.items.length)}${result.errorCodes.length > 0 ? ` codes=${countCodes(result.errorCodes)}` : ""}`,
    );
    return json(
      { status: "success", items: result.items.length, lastSuccessAt: nowIso },
      200,
    );
  } catch (error) {
    console.error(
      `news-sync: ${error instanceof Error ? error.message.slice(0, 200) : "internal"}`,
    );
    await finish(admin, userId, { error_message: GENERIC_ERROR });
    return json({ status: "error", message: GENERIC_ERROR }, 502);
  }
}

Deno.serve((request: Request) => handle(request));
