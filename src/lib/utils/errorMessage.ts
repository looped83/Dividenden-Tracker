/**
 * Extrahiert eine Fehlermeldung aus unbekannten Fehlerwerten. Supabase-js
 * wirft bei Datenbankfehlern ein `PostgrestError`-Objekt (`{ message, details,
 * hint, code }`), das *kein* `instanceof Error` ist — ein reiner
 * `instanceof Error`-Check verschluckt diese Meldungen und zeigt nur einen
 * generischen Fallback.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}
