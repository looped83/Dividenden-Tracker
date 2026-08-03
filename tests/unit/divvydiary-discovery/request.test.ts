import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_BODY_BYTES,
  UnsafeMethodError,
  assertReadOnlyMethod,
  probe,
} from "../../../scripts/divvydiary-discovery/request.ts";

/**
 * Der lesende Abruf der Discovery (Auftrag Phase B0 §22).
 *
 * Die wichtigste Zusage des Werkzeugs ist, dass es nichts veraendern kann.
 * Sie wird hier nicht beschrieben, sondern geprueft — Methode fuer Methode.
 */

const KEY = "geheimer-schluessel";
const URL_SESSION = "https://api.divvydiary.com/session";

function respond(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(body, {
        status: init.status ?? 200,
        headers: init.headers ?? { "content-type": "application/json" },
      }),
    ),
  );
}

describe("assertReadOnlyMethod", () => {
  it("laesst lesende Methoden durch", () => {
    expect(() => {
      assertReadOnlyMethod("GET");
    }).not.toThrow();
    expect(() => {
      assertReadOnlyMethod("head");
    }).not.toThrow();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("blockiert %s", (method) => {
    expect(() => {
      assertReadOnlyMethod(method);
    }).toThrow(UnsafeMethodError);
  });

  it("blockiert auch in Kleinschreibung und bei unbekannten Verben", () => {
    for (const method of ["post", "put", "patch", "delete", "OPTIONS", "TRACE"]) {
      expect(() => {
        assertReadOnlyMethod(method);
      }).toThrow(UnsafeMethodError);
    }
  });

  it("nennt die erlaubten Methoden in der Meldung", () => {
    expect(() => {
      assertReadOnlyMethod("POST");
    }).toThrow(/GET, HEAD/);
  });
});

describe("probe", () => {
  it("sendet GET mit dem Schluessel im Header und folgt keiner Weiterleitung", async () => {
    const fetchImpl = respond("{}");
    await probe("session", URL_SESSION, { apiKey: KEY, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe(URL_SESSION);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("manual");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
  });

  it("liefert Koerper und Kopfzeilen einer erfolgreichen Antwort", async () => {
    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl: respond('{"portfolios":[]}', {
        headers: {
          "content-type": "application/json",
          etag: 'W/"abc"',
          "x-ratelimit-remaining": "59",
        },
      }),
    });

    expect(result.outcome).toBe("response");
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"portfolios":[]}');
    expect(result.headers["etag"]).toBe('W/"abc"');
    expect(result.headers["x-ratelimit-remaining"]).toBe("59");
  });

  it.each([401, 403, 404, 429, 500])(
    "meldet Status %i als Ergebnis, nicht als Fehler",
    async (status) => {
      const result = await probe("session", URL_SESSION, {
        apiKey: KEY,
        fetchImpl: respond("{}", { status }),
      });

      expect(result.outcome).toBe("response");
      expect(result.status).toBe(status);
    },
  );

  it("erfasst Retry-After bei 429", async () => {
    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl: respond("{}", {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "30" },
      }),
    });

    expect(result.headers["retry-after"]).toBe("30");
  });

  it("meldet eine Zeitueberschreitung, ohne zu werfen", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl,
      timeoutMs: 5,
    });

    expect(result.outcome).toBe("timeout");
    expect(result.detail).toContain("5 ms");
    expect(result.body).toBeNull();
  });

  it("meldet einen nicht erreichbaren Server", async () => {
    const fetchImpl = (() =>
      Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    const result = await probe("session", URL_SESSION, { apiKey: KEY, fetchImpl });

    expect(result.outcome).toBe("network_error");
    expect(result.status).toBeNull();
  });

  it("verfolgt eine Weiterleitung auf einen fremden Host nicht", async () => {
    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl: respond("", {
        status: 302,
        headers: { location: "https://beispiel.invalid/abgriff" },
      }),
    });

    expect(result.outcome).toBe("redirect_blocked");
    expect(result.detail).toContain("beispiel.invalid");
    expect(result.body).toBeNull();
  });

  it("unterscheidet eine Weiterleitung innerhalb des bekannten Hosts", async () => {
    const result = await probe("documentation", `${URL_SESSION}/`, {
      apiKey: KEY,
      fetchImpl: respond("", {
        status: 301,
        headers: { location: "/documentation/index.html" },
      }),
    });

    expect(result.outcome).toBe("redirect_blocked");
    expect(result.detail).toContain("innerhalb");
  });

  it("verwirft eine ueberdimensionierte Antwort, statt sie zu behalten", async () => {
    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl: respond("x".repeat(MAX_BODY_BYTES + 1)),
    });

    expect(result.outcome).toBe("too_large");
    expect(result.body).toBeNull();
  });

  it("behandelt eine leere Antwort als regulaeres Ergebnis", async () => {
    const result = await probe("session", URL_SESSION, {
      apiKey: KEY,
      fetchImpl: respond("", { headers: {} }),
    });

    expect(result.outcome).toBe("response");
    expect(result.body).toBe("");
  });

  it("verwendet 15 Sekunden als Voreinstellung", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
  });
});
