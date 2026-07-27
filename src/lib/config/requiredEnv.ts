/**
 * Pflicht-Env-Variablen des Frontends.
 *
 * Liegt bewusst als eigenes, abhaengigkeitsfreies Modul vor, damit sowohl
 * `vite.config.ts` (Build-Guard) als auch die Unit-Tests dieselbe Quelle
 * nutzen. Kein Import aus `@/...`, weil der Alias erst in der Vite-Config
 * definiert wird.
 */
export const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

/**
 * Liefert die fehlenden Pflicht-Variablen. Leere Strings gelten als fehlend,
 * da Vite sie beim Build genauso zu einem falsy Wert ersetzt wie `undefined`.
 */
export function findMissingEnv(
  env: Record<string, string | undefined>,
): RequiredEnvKey[] {
  return REQUIRED_ENV.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
}

/**
 * Fehlermeldung fuer den Build-Abbruch.
 *
 * Hintergrund: `src/lib/supabase/client.ts` wirft bei fehlendem Key auf
 * Modulebene. Vite ersetzt `import.meta.env.VITE_*` beim Build statisch durch
 * `undefined`; die Guard-Bedingung wird dadurch zur Compile-Zeit konstant wahr.
 * Rolldown faltet das zu einem unbedingten Top-Level-`throw` und entfernt die
 * gesamte dahinterliegende App als nicht erreichbaren Code. Der Build meldet
 * dann Erfolg und liefert ein Bundle ohne Anwendung aus (weisse Seite).
 */
export function missingEnvMessage(missing: readonly string[]): string {
  return (
    `Build abgebrochen: ${missing.join(", ")} nicht gesetzt.\n` +
    "Ohne diese Werte entfernt der Bundler die gesamte App aus dem Bundle " +
    "und das Deployment zeigt nur eine weisse Seite.\n" +
    "Siehe .env.example; im CI/Deployment als Secrets hinterlegen."
  );
}
