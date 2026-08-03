/**
 * Zerlegung der `SUMMARY`-Zeile des DivvyDiary-Feeds.
 *
 * Der Feed presst vier Angaben in eine Zeile:
 *
 * ```
 * Verizon Communications Inc 51,37 € Zahltag (Trade Republic)
 * └─ Unternehmen ─────────┘ └ Betrag ┘ └ Art ┘ └─ Depot ──┘
 * ```
 *
 * Zerlegt wird **von rechts nach links**: Nur das Ende der Zeile hat eine feste
 * Gestalt (Klammer, Schlagwort, Betrag), waehrend der Unternehmensname beliebig
 * viele Woerter, Punkte und Leerzeichen enthaelt. Von links liesse sich nicht
 * entscheiden, wo der Name aufhoert.
 *
 * **Grundsatz: lieber nichts als etwas Erfundenes.** Passt ein Teil nicht auf
 * das Muster, bleibt das jeweilige Feld leer und die vollstaendige Zeile bleibt
 * als Titel erhalten. Ein halb geratener Betrag waere schlimmer als gar keiner —
 * er stuende neben echten Finanzdaten und waere nicht als Vermutung erkennbar.
 */
import type { CalendarEventType } from "./ical.ts";

export interface ParsedSummary {
  /** Unternehmensname ohne Betrag, Ereignisart und Depot. */
  company: string | null;
  /** Kanonischer Dezimalstring ("51.37") — niemals eine Fliesskommazahl. */
  amount: string | null;
  /** ISO-4217-Code, aus Zeichen oder Code der Zeile. */
  currency: string | null;
  /** Aus dem Schlagwort der Zeile, falls vorhanden. */
  eventType: CalendarEventType | null;
  /** Depot oder Broker aus der Klammer am Zeilenende. */
  portfolio: string | null;
}

const EMPTY: ParsedSummary = {
  company: null,
  amount: null,
  currency: null,
  eventType: null,
  portfolio: null,
};

/**
 * Waehrungszeichen, die eindeutig einem Code entsprechen.
 *
 * `$` allein ist streng genommen mehrdeutig (USD, CAD, AUD …). DivvyDiary
 * rechnet den Kalender in die Waehrung des Portfolios um und stellt bei den
 * uebrigen Dollar-Waehrungen ein Laenderkuerzel voran; ein blankes `$` ist
 * daher USD. Die eindeutigeren Schreibweisen stehen zuerst, damit `CA$` nicht
 * als `$` gelesen wird.
 */
const CURRENCY_SYMBOLS: readonly (readonly [string, string])[] = [
  ["CA$", "CAD"],
  ["C$", "CAD"],
  ["AU$", "AUD"],
  ["A$", "AUD"],
  ["NZ$", "NZD"],
  ["HK$", "HKD"],
  ["US$", "USD"],
  ["€", "EUR"],
  ["$", "USD"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₣", "CHF"],
];

const EVENT_TYPE_WORDS: readonly (readonly [RegExp, CalendarEventType])[] = [
  [/^(zahltag|zahltage|payday|pay[- ]?date|payment[- ]?date)$/i, "payment"],
  [/^(ex[- ]?tag|ex[- ]?datum|ex[- ]?dividende|ex[- ]?date|ex[- ]?day)$/i, "ex_date"],
];

/**
 * Depot/Broker in Klammern am Zeilenende. Das Muster laesst mehr zu, als die
 * Spalte fasst: Eine ueberlange Angabe soll als Depot **erkannt** und dann
 * gekuerzt werden, statt unerkannt im Unternehmensnamen stehen zu bleiben.
 */
const TRAILING_PARENTHESES = /\s*\(([^()]{1,400})\)\s*$/;

/** Ein bis zwei Woerter am Zeilenende — Kandidaten fuer die Ereignisart. */
const TRAILING_WORDS = /\s+([\p{L}][\p{L}\- ]{0,24})$/u;

/** Betrag und Waehrung am Zeilenende, in beiden Reihenfolgen. */
const AMOUNT_THEN_CURRENCY =
  /\s*(-?[\d][\d.,\u00a0\u202f ]*)\s*([^\s\d]{1,3}|[A-Z]{3})\s*$/;
const CURRENCY_THEN_AMOUNT =
  /\s*([^\s\d]{1,3}|[A-Z]{3})\s*(-?[\d][\d.,\u00a0\u202f ]*)\s*$/;

/**
 * Laengengrenzen der Spalten aus Migration 0028. Sie stehen hier, weil der
 * Parser sie einhalten muss: Eine Zeile, die er nicht zerlegen kann, ergaebe
 * sonst einen Unternehmensnamen in voller SUMMARY-Laenge (bis 500 Zeichen) —
 * und der Datenbank-Check `length(company_name) between 1 and 300` liesse den
 * ganzen Lauf scheitern. Ein zu langer Name wird gekuerzt, nicht verworfen.
 */
const MAX_COMPANY_LENGTH = 300;
const MAX_PORTFOLIO_LENGTH = 200;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Gekuerzter, leerer Wert wird zu `null` — die Spalten verlangen mindestens ein Zeichen. */
function trimTo(value: string, maxLength: number): string | null {
  const trimmed = collapseSpaces(value).slice(0, maxLength).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Waehrungscode eines Zeichens oder Codes; `null`, wenn beides nicht passt.
 */
export function toCurrencyCode(token: string): string | null {
  const trimmed = token.trim();
  if (trimmed.length === 0) return null;
  for (const [symbol, code] of CURRENCY_SYMBOLS) {
    if (trimmed === symbol) return code;
  }
  return /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * Wandelt eine geschriebene Zahl in einen kanonischen Dezimalstring.
 *
 * Deutsche und englische Schreibweise werden beide erkannt: Stehen Punkt und
 * Komma gemeinsam, ist das **letzte** Zeichen das Dezimaltrennzeichen und das
 * andere die Tausendergruppierung. Steht nur eines, entscheidet die Zahl der
 * folgenden Ziffern — genau drei bedeuten eine Tausendergruppe („1.234" ist
 * 1234), alles andere ein Dezimaltrennzeichen („51,37" ist 51,37).
 *
 * Rechnen findet hier nicht statt; es wird ausschliesslich umgeschrieben. Der
 * Wert erreicht die Anwendung als String und wird erst dort ueber `lib/money`
 * (Decimal) verarbeitet — nie als Fliesskommazahl (CALCULATION_RULES.md §8).
 */
export function toCanonicalAmount(raw: string): string | null {
  // `\s` deckt auch das geschuetzte und das schmale Leerzeichen ab, mit denen
  // Tausendergruppen ueblicherweise gesetzt werden.
  const cleaned = raw.replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digitsPart = negative ? cleaned.slice(1) : cleaned;

  const lastComma = digitsPart.lastIndexOf(",");
  const lastDot = digitsPart.lastIndexOf(".");

  let integerPart: string;
  let fractionPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    integerPart = digitsPart.slice(0, decimalAt).replace(/[.,]/g, "");
    fractionPart = digitsPart.slice(decimalAt + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separatorAt = Math.max(lastComma, lastDot);
    const after = digitsPart.slice(separatorAt + 1);
    const before = digitsPart.slice(0, separatorAt);
    // Genau drei Ziffern dahinter und keine weitere Trennung davor: Tausender.
    if (after.length === 3 && !/[.,]/.test(before) && before.length > 0) {
      integerPart = `${before}${after}`;
    } else {
      integerPart = before.replace(/[.,]/g, "");
      fractionPart = after;
    }
  } else {
    integerPart = digitsPart;
  }

  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart !== "" && !/^\d+$/.test(fractionPart)) return null;
  // Unplausible Groessenordnungen deuten auf eine Fehlinterpretation hin.
  if (integerPart.length > 12) return null;

  const value = fractionPart === "" ? integerPart : `${integerPart}.${fractionPart}`;
  return negative ? `-${value}` : value;
}

function readEventType(word: string): CalendarEventType | null {
  const trimmed = word.trim();
  for (const [pattern, type] of EVENT_TYPE_WORDS) {
    if (pattern.test(trimmed)) return type;
  }
  return null;
}

interface Money {
  amount: string;
  currency: string;
}

function readTrailingMoney(text: string): { money: Money; rest: string } | null {
  for (const [pattern, order] of [
    [AMOUNT_THEN_CURRENCY, "amount-first"],
    [CURRENCY_THEN_AMOUNT, "currency-first"],
  ] as const) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [rawAmount, rawCurrency] =
      order === "amount-first" ? [match[1], match[2]] : [match[2], match[1]];
    const amount = toCanonicalAmount(rawAmount);
    const currency = toCurrencyCode(rawCurrency);
    // Beides oder nichts: Ein Betrag ohne Waehrung ist nicht darstellbar, eine
    // Waehrung ohne Betrag sagt nichts.
    if (amount === null || currency === null) continue;
    return { money: { amount, currency }, rest: text.slice(0, match.index) };
  }
  return null;
}

/**
 * Zerlegt eine SUMMARY-Zeile. Erkennt sie nichts, bleibt alles leer — die
 * Aufrufstelle nutzt dann weiterhin die vollstaendige Zeile als Titel.
 */
export function parseSummary(summary: string | null): ParsedSummary {
  if (summary === null) return EMPTY;
  let rest = collapseSpaces(summary);
  if (rest.length === 0) return EMPTY;

  let portfolio: string | null = null;
  let eventType: CalendarEventType | null = null;
  let amount: string | null = null;
  let currency: string | null = null;

  const parentheses = TRAILING_PARENTHESES.exec(rest);
  if (parentheses) {
    portfolio = trimTo(parentheses[1], MAX_PORTFOLIO_LENGTH);
    rest = rest.slice(0, parentheses.index);
  }

  // Bis zu zwei Schlagwoerter abtragen: „Ex-Tag" ist eines, „Pay Date" zwei.
  for (let attempt = 0; attempt < 2 && eventType === null; attempt += 1) {
    const words = TRAILING_WORDS.exec(rest);
    if (!words) break;
    const type = readEventType(words[1]);
    if (type === null) break;
    eventType = type;
    rest = rest.slice(0, words.index);
  }

  const money = readTrailingMoney(rest);
  if (money) {
    amount = money.money.amount;
    currency = money.money.currency;
    rest = money.rest;
  }

  const company = trimTo(rest, MAX_COMPANY_LENGTH);
  return { company, amount, currency, eventType, portfolio };
}
