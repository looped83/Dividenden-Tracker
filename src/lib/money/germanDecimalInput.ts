/** Punkte nur als Tausendertrenner: „1.500“, „12.345.678“. */
const GROUPED_INTEGER = /^\d{1,3}(\.\d{3})+$/;

/**
 * Wandelt eine deutsch formatierte Nutzereingabe (Komma als Dezimaltrennzeichen,
 * Punkt optional als Tausendertrennzeichen, z. B. "1.234,56") in das kanonische
 * Dezimalstring-Format (Punkt als Trennzeichen, lib/money/parsing.ts) um.
 * Ohne Komma gilt ein Punkt nur dann als Tausendertrenner, wenn danach je
 * genau drei Ziffern folgen („1.500“); sonst bleibt die Eingabe unveraendert
 * (deckt z. B. eingefuegten kanonischen Text wie „73.63“ ab).
 */
export function normalizeGermanDecimalInput(value: string): string {
  const trimmed = value.trim();
  if (GROUPED_INTEGER.test(trimmed)) return trimmed.replace(/\./g, "");
  if (trimmed === "" || !trimmed.includes(",")) {
    return trimmed;
  }
  return trimmed.replace(/\./g, "").replace(",", ".");
}

/** Kehrt normalizeGermanDecimalInput um: kanonischer Dezimalstring -> deutsche Anzeige. */
export function toGermanDecimalString(canonical: string): string {
  return canonical.replace(".", ",");
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Kanonischer Dezimalstring -> Betragsfeld mit Tausenderpunkt: "1500.5" -> "1.500,5". */
export function toGermanAmountInput(canonical: string): string {
  const dot = canonical.indexOf(".");
  return dot < 0
    ? groupThousands(canonical)
    : `${groupThousands(canonical.slice(0, dot))},${canonical.slice(dot + 1)}`;
}

/**
 * Eingefuegter Text in der Form des Felds: Stehen Komma und Punkt darin
 * („1.234,56“ oder englisch „1,234.56“), trennt das hintere Zeichen die
 * Nachkommastellen, das andere die Tausender. Mehrere gleiche Trenner
 * („1,000,000“, „1.000.000“) sind Tausender; ein einzelner Punkt ohne
 * Dreiergruppen („12.50“) ist ein Dezimalpunkt.
 */
function pastedAmount(text: string): string {
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? comma : dot;
    const head = text.slice(0, decimal).replace(/[.,]/g, "");
    return `${head},${text.slice(decimal + 1)}`;
  }
  const separator = comma >= 0 ? "," : ".";
  const count = text.split(separator).length - 1;
  if (count > 1 || GROUPED_INTEGER.test(text.trim())) {
    return text.replaceAll(separator, "");
  }
  return separator === "." ? text.replace(".", ",") : text;
}

export interface AmountInputState {
  value: string;
  caret: number;
}

/**
 * Formatiert ein Betragsfeld waehrend des Tippens: Die Tausenderpunkte setzt
 * das Feld selbst, das Komma trennt die Nachkommastellen. Die Schreibmarke
 * bleibt hinter derselben Ziffer stehen.
 *
 * `inserted` ist der gerade eingefuegte Text (`null` beim Loeschen). Ein
 * einzeln getippter Punkt wird zum Komma — manche Zahlentastaturen bieten nur
 * den Punkt an, und Tausenderpunkte tippt hier niemand mehr. Eingefuegten
 * Text liest {@link pastedAmount}, deutsch wie englisch formatiert.
 */
export function applyAmountInput(
  raw: string,
  caret: number,
  inserted: string | null,
  maxFractionDigits = 2,
): AmountInputState {
  let text = raw;
  let position = Math.min(Math.max(caret, 0), raw.length);

  if (inserted !== null && inserted.length > 0) {
    const start = position - inserted.length;
    const before = text.slice(0, start);
    const after = text.slice(position);
    if (inserted === "." || inserted === ",") {
      if ((before + after).includes(",")) {
        text = before + after;
        position = start;
      } else {
        text = `${before},${after}`;
      }
    } else if (start >= 0 && inserted.length > 1) {
      const pasted = pastedAmount(inserted);
      text = before + pasted + after;
      position = start + pasted.length;
    }
  }

  // Nur Ziffern und das erste Komma bleiben; `cursor` zaehlt sie vor der Marke.
  let cleaned = "";
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const keep = (char >= "0" && char <= "9") || (char === "," && !cleaned.includes(","));
    if (!keep) continue;
    cleaned += char;
    if (index < position) cursor += 1;
  }
  if (cleaned === "") return { value: "", caret: 0 };

  const comma = cleaned.indexOf(",");
  let integer = comma < 0 ? cleaned : cleaned.slice(0, comma);
  let fraction = comma < 0 ? null : cleaned.slice(comma + 1);

  let zeros = 0;
  while (zeros < integer.length - 1 && integer[zeros] === "0") zeros += 1;
  integer = integer.slice(zeros);
  cursor -= Math.min(cursor, zeros);
  if (integer === "") {
    integer = "0";
    if (cursor > 0) cursor += 1;
  }

  if (fraction !== null && fraction.length > maxFractionDigits) {
    fraction = fraction.slice(0, maxFractionDigits);
    cursor = Math.min(cursor, integer.length + 1 + fraction.length);
  }
  if (maxFractionDigits === 0) fraction = null;

  const grouped = groupThousands(integer);
  let caretOut: number;
  if (cursor <= integer.length) {
    // Punkte vor den ersten `cursor` Ziffern: vor Ziffer i steht einer,
    // wenn rechts davon ein Vielfaches von drei Ziffern folgt.
    let dots = 0;
    for (let digit = 1; digit < cursor; digit += 1) {
      if ((integer.length - digit) % 3 === 0) dots += 1;
    }
    caretOut = cursor + dots;
  } else {
    caretOut = grouped.length + (cursor - integer.length);
  }

  const value = fraction === null ? grouped : `${grouped},${fraction}`;
  return { value, caret: Math.min(caretOut, value.length) };
}
