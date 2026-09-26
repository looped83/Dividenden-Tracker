import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Der Client ist aus Anmeldung, PostgREST und Edge Functions zusammengesetzt
 * statt ueber `createClient` (lib/supabase/client.ts). Geprueft wird, was
 * `createClient` sonst garantierte: derselbe Speicherschluessel der Sitzung —
 * sonst waere nach dem Update jeder abgemeldet — und dieselben Kopfzeilen je
 * Anfrage.
 *
 * Adresse und Schluessel stammen aus der Testumgebung (vite.config.ts):
 * `https://test.supabase.co`, `test-anon-key`.
 */
const fetchMock = vi.fn(() =>
  Promise.resolve(
    new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
  ),
);

beforeAll(() => {
  // Eine Sitzung, wie supabase-js sie unter `sb-<projekt>-auth-token` ablegt.
  localStorage.setItem(
    "sb-test-auth-token",
    JSON.stringify({
      access_token: "user-token",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1", aud: "authenticated", app_metadata: {}, user_metadata: {} },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function lastRequest(): { url: string; headers: Headers } {
  const [input, init] = fetchMock.mock.lastCall as unknown as [
    string | URL,
    RequestInit?,
  ];
  return { url: input.toString(), headers: new Headers(init?.headers) };
}

describe("Supabase-Client", () => {
  it("uebernimmt die bestehende Sitzung und schickt sie an PostgREST", async () => {
    const { supabase } = await import("@/lib/supabase/client");
    await supabase.from("depots").select("id");

    const { url, headers } = lastRequest();
    expect(url).toBe("https://test.supabase.co/rest/v1/depots?select=id");
    expect(headers.get("apikey")).toBe("test-anon-key");
    expect(headers.get("Authorization")).toBe("Bearer user-token");
  });

  it("ruft Edge Functions mit dem Sitzungstoken auf", async () => {
    const { supabase } = await import("@/lib/supabase/client");
    await supabase.functions.invoke("sync-divvydiary-calendar", { method: "POST" });

    const { url, headers } = lastRequest();
    expect(url).toBe("https://test.supabase.co/functions/v1/sync-divvydiary-calendar");
    expect(headers.get("apikey")).toBe("test-anon-key");
    expect(headers.get("Authorization")).toBe("Bearer user-token");
  });
});
