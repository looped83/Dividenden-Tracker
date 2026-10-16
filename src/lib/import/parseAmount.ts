import { MoneyDecimal, type DecimalInstance } from "@/lib/money/decimalConfig";

/**
 * Betragsnormalisierung fuer den Import (IMPORT_SPEC.md §5, CALCULATION_RULES.md §7).
 *
 * Wandelt lokal formatierte Betraege (deutsch `1.234,56`, englisch `1,234.56`,
 * neutral `1234.56`) in einen kanonischen Dezimalstring (Punkt als
 * Trennzeichen). Es wird NIEMALS `parseFloat` verwendet — die Umwandlung
 * laeuft ueber String-Manipulation und Decimal.js, damit keine binaere
 * Rundungsabweichung entsteht. Es wird nicht gerundet (Quelldezimalstellen
 * bleiben erhalten).
 */

export type NumberFormat = "de" | "en" | "auto";

export interface ParsedAmount {
  /** Kanonischer Dezimalstring, z. B. "-1234.56". */
  canonical: string;
  /** Decimal-Instanz fuer exakte Weiterverarbeitung/Summierung. */
  decimal: DecimalInstance;
}

export type AmountParseOutcome =
  | { ok: true; value: ParsedAmount }
  | { ok: false; error: { reason: string; ambiguous?: boolean } };

function ok(canonical: string): AmountParseOutcome {
  return { ok: true, value: { canonical, decimal: new MoneyDecimal(canonical) } };
}
function fail(reason: string, ambiguous = false): AmountParseOutcome {
  return { ok: false, error: { reason, ambiguous } };
}

/**
 * @param raw    Zellwert (String oder Zahl).
 * @param format Erwartetes Zahlenformat der Spalte. `auto` versucht eine
 *               eindeutige Bestimmung und meldet Mehrdeutigkeit.
 */
export function parseAmount(
  raw: string | number | boolean | null,
  format: NumberFormat = "auto",
): AmountParseOutcome {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return fail("Betrag fehlt");
  }
  if (typeof raw === "boolean") return fail("Ein Wahrheitswert ist kein Betrag");

  // exceljs liefert Zahlenzellen direkt als number — das ist der sicherste Fall,
  // aber ueber toFixed/Decimal, nie ueber Float-Arithmetik weiterverwenden.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw))
      return fail(`Zahlenwert "${String(raw)}" ist kein gueltiger Betrag`);
    // Number -> String ist verlustfrei fuer die hier auftretenden 2-stelligen
    // Geldbetraege; Decimal normalisiert die Darstellung.
    return ok(new MoneyDecimal(raw).toString());
  }

  let text = raw.trim();

  // Waehrungssymbole, geschuetzte Leerzeichen und normale Leerzeichen entfernen.
  text = text.replace(/[€$£¥\s\u00a0\u202f]/g, "").replace(/[A-Za-z]/g, "");

  // Klammer-Notation fuer negative Betraege: (1.234,56) -> -1.234,56
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  // Unicode-Minus / fuehrendes oder nachgestelltes Minus.
  text = text.replace(/−/g, "-");
  if (text.startsWith("-") || text.endsWith("-")) {
    negative = true;
    text = text.replace(/-/g, "");
  }
  if (text.startsWith("+")) text = text.slice(1);

  if (text === "" || !/[0-9]/.test(text)) {
    return fail(`"${raw}" ist kein unterstuetztes Zahlenformat`);
  }
  if (!/^[0-9.,]+$/.test(text)) {
    return fail(`"${raw}" enthaelt ein nicht unterstuetztes Zahlenformat`);
  }

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let canonical: string;

  if (hasComma && hasDot) {
    // Das zuletzt auftretende Zeichen ist das Dezimaltrennzeichen.
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    const decimalIsComma = lastComma > lastDot;
    if (format === "de" && !decimalIsComma)
      return fail(`"${raw}" passt nicht zum deutschen Zahlenformat`);
    if (format === "en" && decimalIsComma)
      return fail(`"${raw}" passt nicht zum englischen Zahlenformat`);
    canonical = decimalIsComma
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    // Nur Komma vorhanden.
    const parts = text.split(",");
    if (format === "de") {
      canonical = joinAsDecimal(parts);
    } else if (format === "en") {
      // Komma ist Tausendertrennzeichen.
      canonical = parts.join("");
    } else {
      // auto: eindeutig, wenn mehrere Kommata (Tausender) ODER die Gruppe nach
      // dem Komma nicht exakt 3 Ziffern hat (dann Dezimal). Sonst mehrdeutig.
      if (parts.length > 2) {
        canonical = parts.join(""); // 1,234,567 -> Tausender
      } else if ((parts.at(1)?.length ?? 3) !== 3) {
        canonical = joinAsDecimal(parts); // z. B. 1,5 oder 1,56 -> Dezimal
      } else {
        return fail(
          `"${raw}" ist mehrdeutig (Dezimal- oder Tausendertrennzeichen)`,
          true,
        );
      }
    }
  } else if (hasDot) {
    const parts = text.split(".");
    if (format === "de") {
      // Punkt ist Tausendertrennzeichen.
      canonical = parts.join("");
    } else if (format === "en") {
      canonical = joinAsDecimal(parts);
    } else {
      if (parts.length > 2) {
        canonical = parts.join(""); // 1.234.567 -> Tausender
      } else if ((parts.at(1)?.length ?? 3) !== 3) {
        canonical = joinAsDecimal(parts);
      } else {
        return fail(
          `"${raw}" ist mehrdeutig (Dezimal- oder Tausendertrennzeichen)`,
          true,
        );
      }
    }
  } else {
    canonical = text;
  }

  if (!/^\d+(\.\d+)?$/.test(canonical)) {
    return fail(`"${raw}" konnte nicht in einen Betrag umgewandelt werden`);
  }
  return ok(negative ? `-${canonical}` : canonical);
}

function joinAsDecimal(parts: string[]): string {
  const decimals = parts.pop() ?? "";
  return `${parts.join("")}.${decimals}`;
}
