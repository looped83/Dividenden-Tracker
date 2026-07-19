/**
 * Umrechnung von Excel-Datumsserien in echte Kalenderdaten (IMPORT_SPEC.md §5).
 *
 * Excel speichert Datumswerte als Seriennummern (Tage seit einem Epochentag).
 * Es gibt zwei Systeme:
 *   * 1900-System (Windows-Standard): Tag 1 = 1900-01-01, mit dem bekannten
 *     Schaltjahr-Bug (der 29.02.1900 existiert als Serie 60, obwohl 1900 kein
 *     Schaltjahr war). Praktische Epoche daher 1899-12-30.
 *   * 1904-System (aeltere Mac-Arbeitsmappen): Tag 0 = 1904-01-01.
 *
 * Es wird ausschliesslich in UTC gerechnet, damit keine Zeitzonenverschiebung
 * das Datum um einen Tag verschiebt.
 */

const MS_PER_DAY = 86_400_000;
// 1899-12-30 als UTC-Millisekunden (kompensiert den Excel-1900-Schaltjahr-Bug).
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

export interface ExcelDateResult {
  /** ISO-Datum `YYYY-MM-DD` (reines Datum, keine Uhrzeit, kein UTC-Zeitpunkt). */
  iso: string;
  /** true, wenn die Serie einen von 0 verschiedenen Zeitanteil enthielt. */
  hasTimeComponent: boolean;
}

export class ExcelDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelDateError";
  }
}

/**
 * Wandelt eine Excel-Serientagnummer in ein ISO-Datum um.
 *
 * @param serial   Seriennummer aus der Zelle (kann Nachkommastellen = Uhrzeit haben).
 * @param date1904 true fuer 1904-basierte Arbeitsmappen.
 */
export function excelSerialToIso(serial: number, date1904 = false): ExcelDateResult {
  if (!Number.isFinite(serial)) {
    throw new ExcelDateError(`Ungueltige Excel-Datumsserie: ${String(serial)}`);
  }
  // Im 1900-System sind Serien < 1 kein gueltiges Datum; im 1904-System ist 0 gueltig.
  const minSerial = date1904 ? 0 : 1;
  if (serial < minSerial) {
    throw new ExcelDateError(
      `Excel-Datumsserie ${String(serial)} liegt vor dem gueltigen Bereich.`,
    );
  }

  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const epoch = date1904 ? EPOCH_1904 : EPOCH_1900;
  const ms = epoch + wholeDays * MS_PER_DAY;
  const date = new Date(ms);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return {
    iso: `${String(year)}-${month}-${day}`,
    // Zeitanteil > ~1 Sekunde als relevant werten (Rundungstoleranz der Serie).
    hasTimeComponent: fraction > 1 / 86_400 && fraction < 1 - 1 / 86_400,
  };
}
