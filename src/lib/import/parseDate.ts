import { excelSerialToIso, ExcelDateError } from "./excelDate";

/**
 * Datumsnormalisierung fuer den Import (IMPORT_SPEC.md §5, §11).
 *
 * Unterstuetzt:
 *   * echte Date-Objekte (exceljs liefert Datumszellen bereits als Date),
 *   * Excel-Serienzahlen (1900/1904),
 *   * Textformate `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`.
 *
 * Das Format wird pro Datei/Spalte festgelegt (nicht pro Zeile) — bei
 * mehrdeutigen Werten (z. B. `03/04/2024`) wird eine explizite Wahl verlangt.
 * Es findet keine stillschweigende Korrektur ungueltiger Daten statt.
 */

export type DateFormat =
  | "iso" // YYYY-MM-DD
  | "de" // DD.MM.YYYY oder DD.MM.YY
  | "dmy_slash" // DD/MM/YYYY
  | "mdy_slash" // MM/DD/YYYY
  | "excel_serial"; // reine Seriennummer

export interface ParsedDate {
  iso: string;
  hasTimeComponent?: boolean;
}

export interface DateParseError {
  reason: string;
}

export type DateParseOutcome =
  { ok: true; value: ParsedDate } | { ok: false; error: DateParseError };

function ok(iso: string, hasTimeComponent = false): DateParseOutcome {
  return { ok: true, value: { iso, hasTimeComponent } };
}
function fail(reason: string): DateParseOutcome {
  return { ok: false, error: { reason } };
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
  );
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandTwoDigitYear(yy: number): number {
  // Fenster: 00–69 => 2000–2069, 70–99 => 1970–1999 (deckt 2012–2026 sicher ab).
  return yy <= 69 ? 2000 + yy : 1900 + yy;
}

/**
 * Ganzzahl-Parsing fuer nicht-finanzielle Werte (Datumsbestandteile). `Number`
 * ist projektweit fuer Geldbetraege gesperrt; `Number.parseInt` mit Radix ist
 * fuer solche technischen Werte ausdruecklich erlaubt (eslint.config.js).
 */
function toInt(value: string): number {
  return Number.parseInt(value, 10);
}

/**
 * Parst einen einzelnen Datumswert im vorgegebenen Format.
 * `date1904` gilt nur fuer Excel-Serienzahlen.
 */
export function parseDateValue(
  raw: string | number | boolean | Date | null,
  format: DateFormat,
  date1904 = false,
): DateParseOutcome {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return fail("Datum fehlt");
  }
  if (typeof raw === "boolean") return fail("Ein Wahrheitswert ist kein Datum");

  // exceljs liefert Datumszellen als echtes Date-Objekt (UTC-Mitternacht).
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return fail("Ungueltiges Datum");
    const iso = toIso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
    const hasTime =
      raw.getUTCHours() !== 0 || raw.getUTCMinutes() !== 0 || raw.getUTCSeconds() !== 0;
    return ok(iso, hasTime);
  }

  if (format === "excel_serial") {
    const serial = typeof raw === "number" ? raw : toInt(raw.trim());
    if (!Number.isFinite(serial))
      return fail(`"${String(raw)}" ist keine Excel-Datumsserie`);
    try {
      const result = excelSerialToIso(serial, date1904);
      return ok(result.iso, result.hasTimeComponent);
    } catch (error) {
      return fail(
        error instanceof ExcelDateError ? error.message : "Ungueltige Excel-Datumsserie",
      );
    }
  }

  // Zahl ohne explizites Serial-Format: sehr wahrscheinlich versehentlich ein
  // Excel-Serienwert — niemals als Unix-Zeitstempel interpretieren.
  if (typeof raw === "number") {
    return fail(
      `Zahlenwert "${String(raw)}" kann ohne Datumsformat nicht eindeutig als Datum interpretiert werden`,
    );
  }

  const text = raw.trim();

  if (format === "iso") {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (!m) return fail(`"${text}" ist kein ISO-Datum (YYYY-MM-DD)`);
    const y = toInt(m.at(1) ?? "");
    const mo = toInt(m.at(2) ?? "");
    const d = toInt(m.at(3) ?? "");
    if (!isRealDate(y, mo, d)) return fail(`"${text}" ist kein gueltiges Datum`);
    return ok(toIso(y, mo, d));
  }

  if (format === "de") {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(text);
    if (!m) return fail(`"${text}" ist kein deutsches Datum (TT.MM.JJJJ)`);
    const rawYear = m.at(3) ?? "";
    const day = toInt(m.at(1) ?? "");
    const month = toInt(m.at(2) ?? "");
    const year =
      rawYear.length === 2 ? expandTwoDigitYear(toInt(rawYear)) : toInt(rawYear);
    if (!isRealDate(year, month, day)) return fail(`"${text}" ist kein gueltiges Datum`);
    return ok(toIso(year, month, day));
  }

  // Slash-Formate
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!m) return fail(`"${text}" ist kein Datum im Format TT/MM/JJJJ bzw. MM/TT/JJJJ`);
  const rawYear = m.at(3) ?? "";
  const a = toInt(m.at(1) ?? "");
  const b = toInt(m.at(2) ?? "");
  const year = rawYear.length === 2 ? expandTwoDigitYear(toInt(rawYear)) : toInt(rawYear);
  const day = format === "dmy_slash" ? a : b;
  const month = format === "dmy_slash" ? b : a;
  if (!isRealDate(year, month, day)) return fail(`"${text}" ist kein gueltiges Datum`);
  return ok(toIso(year, month, day));
}

/**
 * Erkennt anhand einer Stichprobe das Datumsformat einer Textspalte.
 * Gibt `ambiguous: true` zurueck, wenn zwischen TT/MM und MM/TT nicht sicher
 * unterschieden werden kann (dann muss der Nutzer manuell waehlen).
 */
export function detectDateFormat(samples: (string | number | boolean | Date | null)[]): {
  format: DateFormat | null;
  ambiguous: boolean;
} {
  const values = samples.filter(
    (s): s is string | number | Date =>
      s !== null && typeof s !== "boolean" && String(s).trim() !== "",
  );
  if (values.length === 0) return { format: null, ambiguous: false };

  if (values.every((v) => v instanceof Date)) return { format: "iso", ambiguous: false };
  if (values.every((v) => typeof v === "number"))
    return { format: "excel_serial", ambiguous: false };

  const strings = values.map((v) => String(v).trim());
  if (strings.every((s) => /^\d{4}-\d{1,2}-\d{1,2}/.test(s)))
    return { format: "iso", ambiguous: false };
  if (strings.every((s) => /^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$/.test(s)))
    return { format: "de", ambiguous: false };

  if (strings.every((s) => /^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/.test(s))) {
    // Wenn irgendwo Teil 1 > 12, kann es nur TT/MM sein; wenn Teil 2 > 12, nur MM/TT.
    let dmy = false;
    let mdy = false;
    for (const s of strings) {
      const m = /^(\d{1,2})\/(\d{1,2})\//.exec(s);
      if (!m) continue;
      const first = toInt(m.at(1) ?? "");
      const second = toInt(m.at(2) ?? "");
      if (first > 12) dmy = true;
      if (second > 12) mdy = true;
    }
    if (dmy && !mdy) return { format: "dmy_slash", ambiguous: false };
    if (mdy && !dmy) return { format: "mdy_slash", ambiguous: false };
    return { format: null, ambiguous: true };
  }

  return { format: null, ambiguous: true };
}
