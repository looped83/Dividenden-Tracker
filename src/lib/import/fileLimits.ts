/**
 * Grenzen fuer eingelesene Dateien (SECURITY_MODEL.md, IMPORT_SPEC.md
 * „Datei-Haertung").
 *
 * Der Import las bisher jede Datei ohne Pruefung vollstaendig in den Speicher
 * und parste sie im Hauptthread. Eine versehentlich gewaehlte Videodatei oder
 * ein sehr grosses Archiv liess die Oberflaeche einfrieren, ohne dass je eine
 * verstaendliche Meldung erschien — auf dem iPhone ist das ein Neustart der
 * App.
 *
 * 25 MB sind fuer eine Tabelle mit Dividendeneingaengen reichlich bemessen:
 * Die vorhandene Kontrollmenge (1.439 Zahlungen, 2012–2026) liegt bei rund
 * 48 kB. Die Grenze faengt Fehlgriffe ab, ohne einen realen Anwendungsfall zu
 * behindern.
 */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Zulaessige Endungen; alles andere wird gar nicht erst geoeffnet. */
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

/**
 * Prueft eine Datei vor dem Einlesen. Liefert `null`, wenn sie verwendbar ist,
 * sonst eine Meldung in der Sprache der Anwendung.
 */
export function checkImportFile(file: { name: string; size: number }): string | null {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return "Es werden nur CSV-, XLSX- und XLS-Dateien gelesen.";
  }

  if (file.size > MAX_IMPORT_BYTES) {
    const megabytes = (file.size / 1024 / 1024).toFixed(1).replace(".", ",");
    const limit = MAX_IMPORT_BYTES / 1024 / 1024;
    return `Die Datei ist ${megabytes} MB groß. Zulässig sind höchstens ${String(limit)} MB.`;
  }

  // Eine leere Datei erzeugt sonst erst tief im Parser einen unverstaendlichen
  // Fehler.
  if (file.size === 0) {
    return "Die Datei ist leer.";
  }

  return null;
}
