/**
 * CSV-Analyse fuer den Import (IMPORT_SPEC.md §1, Task §1).
 *
 * Deckt ab: UTF-8 (mit/ohne BOM), Trennzeichen `;`, `,`, Tab (Auto-Erkennung
 * ueber mehrere Zeilen, nicht nur die erste), korrekte Behandlung von
 * Anfuehrungszeichen (RFC-4180-Quoting inkl. `""`-Escapes). Kodierungs-/
 * Parserprobleme werden sichtbar gemeldet, nicht verschluckt.
 *
 * Dezimaltrennzeichen (deutsch/englisch) werden hier NICHT aufgeloest — das
 * uebernimmt parseAmount pro Betragsspalte.
 */

export type Delimiter = ";" | "," | "\t";

export interface CsvParseResult {
  rows: string[][];
  delimiter: Delimiter;
  hadBom: boolean;
  warnings: string[];
}

const DELIMITERS: Delimiter[] = [";", ",", "\t"];

/** Decodiert einen Byte-Puffer als UTF-8 und meldet ein evtl. vorhandenes BOM. */
export function decodeCsv(buffer: ArrayBuffer): {
  text: string;
  hadBom: boolean;
  warnings: string[];
} {
  const bytes = new Uint8Array(buffer);
  const hadBom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const warnings: string[] = [];
  // `fatal: true` meldet ungueltige UTF-8-Sequenzen statt sie stillschweigend
  // durch U+FFFD zu ersetzen.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    // Fallback auf tolerantes Decoding mit sichtbarem Hinweis.
    text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    warnings.push(
      "Die Datei ist nicht durchgaengig als UTF-8 lesbar. Bitte als UTF-8 (CSV) exportieren.",
    );
  }
  return { text, hadBom, warnings };
}

/**
 * Erkennt das Trennzeichen anhand mehrerer nicht-leerer Zeilen: gewaehlt wird
 * das Zeichen mit konsistenter, hoechster Spaltenzahl (> 1).
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "")
    .slice(0, 20);
  let best: Delimiter = ";";
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => splitLine(line, delimiter).length);
    if (counts.length === 0) continue;
    const columns = counts[0];
    if (columns <= 1) continue;
    const consistent = counts.filter((c) => c === columns).length;
    // Score: Konsistenz ueber Zeilen * Spaltenanzahl.
    const score = consistent * 1000 + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Zerlegt eine einzelne Zeile unter Beachtung von Quotes (ohne Zeilenumbrueche im Feld). */
function splitLine(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Vollstaendiger CSV-Parser inkl. mehrzeiliger, gequoteter Felder.
 * `delimiter` kann vorgegeben werden; sonst Auto-Erkennung.
 */
export function parseCsv(buffer: ArrayBuffer, delimiter?: Delimiter): CsvParseResult {
  const { text, hadBom, warnings } = decodeCsv(buffer);
  const body = hadBom ? text.slice(1) : text;
  const useDelimiter = delimiter ?? detectDelimiter(body);

  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === useDelimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // letzte Zeile ohne abschliessenden Umbruch
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (inQuotes) {
    warnings.push(
      "Unvollstaendiges Anfuehrungszeichen: Die Datei koennte beschaedigt sein.",
    );
  }

  // Leere Abschlusszeilen ignorieren.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  return { rows, delimiter: useDelimiter, hadBom, warnings };
}
