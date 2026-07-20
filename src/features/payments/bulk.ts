import { getErrorMessage } from "@/lib/utils/errorMessage";

export interface BulkResult {
  succeeded: number;
  failed: { id: string; message: string }[];
}

/**
 * Führt eine Aktion für mehrere Datensätze aus und meldet Teilergebnisse
 * ehrlich zurück (§14/§20): jede Zeile wird einzeln, serverseitig abgesichert
 * verarbeitet; Fehler werden gesammelt, nicht verschwiegen. Bewusst sequenziell,
 * um die Datenbank nicht mit parallelen Schreibzugriffen zu überlasten und ein
 * deterministisches, nachvollziehbares Ergebnis zu liefern.
 */
export async function runBulk(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: 0, failed: [] };
  for (const id of ids) {
    try {
      await action(id);
      result.succeeded += 1;
    } catch (error) {
      result.failed.push({ id, message: getErrorMessage(error, "Fehlgeschlagen.") });
    }
  }
  return result;
}
