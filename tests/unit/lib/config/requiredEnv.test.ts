import { describe, expect, it } from "vitest";
import {
  REQUIRED_ENV,
  findMissingEnv,
  missingEnvMessage,
} from "@/lib/config/requiredEnv";

/**
 * Regressionstest zu Phase 9.1.
 *
 * Ein Build ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY lief zuvor mit
 * Exit 0 durch und erzeugte ein Bundle ohne Anwendung (~408 kB statt ~2,3 MB):
 * Vite ersetzt `import.meta.env.VITE_*` statisch durch `undefined`, der
 * Modul-Guard in `supabase/client.ts` wird dadurch zum unbedingten
 * Top-Level-`throw`, und Rolldown entfernt die komplette App als nicht
 * erreichbaren Code. Das Deployment zeigte nur eine weisse Seite.
 *
 * Diese Tests sichern die Erkennungslogik ab, die den Build jetzt abbricht.
 */
describe("findMissingEnv", () => {
  const complete = {
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
  };

  it("meldet nichts, wenn alle Pflichtvariablen gesetzt sind", () => {
    expect(findMissingEnv(complete)).toEqual([]);
  });

  it("ignoriert zusaetzliche, nicht geforderte Variablen", () => {
    expect(findMissingEnv({ ...complete, VITE_SOMETHING_ELSE: "x" })).toEqual([]);
  });

  it("meldet alle Variablen, wenn die Umgebung leer ist", () => {
    expect(findMissingEnv({})).toEqual([...REQUIRED_ENV]);
  });

  it.each([...REQUIRED_ENV])("meldet fehlendes %s", (key) => {
    const env = Object.fromEntries(
      Object.entries(complete).filter(([name]) => name !== key),
    );
    expect(findMissingEnv(env)).toEqual([key]);
  });

  it.each([...REQUIRED_ENV])("wertet leeres %s als fehlend", (key) => {
    expect(findMissingEnv({ ...complete, [key]: "" })).toEqual([key]);
  });

  it.each([...REQUIRED_ENV])("wertet %s aus reinem Whitespace als fehlend", (key) => {
    // Vite ersetzt solche Werte zwar nicht durch undefined, sie erzeugen
    // aber genauso einen unbrauchbaren Supabase-Client.
    expect(findMissingEnv({ ...complete, [key]: "   " })).toEqual([key]);
  });

  it("behandelt explizites undefined wie fehlend", () => {
    expect(findMissingEnv({ ...complete, VITE_SUPABASE_ANON_KEY: undefined })).toEqual([
      "VITE_SUPABASE_ANON_KEY",
    ]);
  });
});

describe("missingEnvMessage", () => {
  it("nennt jede fehlende Variable beim Namen", () => {
    const message = missingEnvMessage([...REQUIRED_ENV]);
    for (const key of REQUIRED_ENV) {
      expect(message).toContain(key);
    }
  });

  it("erklaert die Folge (weisse Seite) statt nur zu melden", () => {
    expect(missingEnvMessage(["VITE_SUPABASE_URL"])).toContain("weisse Seite");
  });

  it("verweist auf .env.example als naechsten Schritt", () => {
    expect(missingEnvMessage(["VITE_SUPABASE_URL"])).toContain(".env.example");
  });
});
