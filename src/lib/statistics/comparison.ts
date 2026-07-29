import { EUR, Money } from "@/lib/money";
import {
  isoDate,
  isoFromRef,
  lastDayOfMonth,
  monthNameDeShort,
  type DateRange,
  type RefDate,
} from "./dates";
import { aggregate, comparePeriods } from "./analytics";
import type { AnalyticsPayment, ComparisonResult } from "./types";

/**
 * Gegenüberstellung zweier Zeiträume.
 *
 * **Die eine Regel, auf der alles steht: Beide Seiten müssen denselben
 * Zeitausschnitt abdecken.** Ein laufendes Jahr gegen ein volles Vorjahr zu
 * stellen ist kein Vergleich, sondern eine systematische Untertreibung — im
 * Juli fehlen der einen Seite fünf Monate. Genau diesen Fehler machen
 * Auswertungen am häufigsten, und er fällt nicht auf, weil das Ergebnis
 * plausibel aussieht.
 *
 * Ist eines der beiden Jahre das laufende, werden **beide** Seiten am
 * Referenztag gekappt (1.1. bis heute gegen 1.1. bis zum selben Tag des
 * anderen Jahres). Sind beide Jahre abgeschlossen, zählt jeweils das volle
 * Jahr.
 *
 * Enthält keine Prognose und keine Hochrechnung (Grundsatz 8): Es werden
 * ausschließlich vorhandene Zahlungen summiert.
 */

/** Eine Seite des Vergleichs. */
export interface ComparisonSide {
  /** Beschriftung für die Anzeige, z. B. „2026". */
  label: string;
  range: DateRange;
  net: Money;
  count: number;
}

/** Eine Seite eines Vergleichsmonats. */
export interface ComparisonMonthSide {
  /** Kalenderjahr, aus dem dieser Monatswert stammt. */
  year: number;
  /** 1..12 — der Kalendermonat. */
  month: number;
  net: Money;
  /** Laufende Summe seit Beginn des Zeitraums. */
  cumulative: Money;
  /**
   * Wahr, wenn der Monat vollständig im Zeitraum liegt.
   *
   * Ein angeschnittener Monat (der Stichtagsmonat) darf **nicht** auf die
   * Zahlungsliste verlinken: Die Liste kennt nur Jahr und Monat, zeigte also
   * mehr als die Zahl daneben behauptet.
   */
  complete: boolean;
}

/** Ein Monat der Gegenüberstellung. */
export interface ComparisonMonth {
  /** Kalendermonat der aktuellen Seite (1..12) — der Zeilenschlüssel. */
  month: number;
  /** Kurzname, z. B. „Mär". */
  label: string;
  current: ComparisonMonthSide;
  reference: ComparisonMonthSide;
}

export interface PeriodComparison {
  current: ComparisonSide;
  reference: ComparisonSide;
  change: ComparisonResult;
  months: ComparisonMonth[];
  /**
   * Wahr, wenn beide Seiten am Referenztag gekappt wurden. Die Oberfläche muss
   * das benennen — eine Zahl, die „2026" heißt, aber nur bis Juli reicht,
   * führt sonst in die Irre.
   */
  truncated: boolean;
  /** Letzter berücksichtigter Tag der aktuellen Seite (ISO). */
  cutoff: string;
}

/** Summe und Anzahl innerhalb eines Bereichs. */
function within(
  payments: readonly AnalyticsPayment[],
  range: DateRange,
): { net: Money; count: number } {
  const inside = payments.filter(
    (payment) => payment.payDate >= range.start && payment.payDate <= range.end,
  );
  const { net, count } = aggregate(inside);
  return { net, count };
}

/**
 * Kappt ein Jahr am Tag des Referenzdatums. Hat der Monat im Zieljahr weniger
 * Tage (29.02. in einem Nicht-Schaltjahr), wird auf dessen letzten Tag
 * abgebildet — sonst entstünde ein ungültiges Datum.
 */
function truncatedYearRange(year: number, ref: RefDate): DateRange {
  const day = Math.min(ref.day, lastDayOfMonth(year, ref.month));
  return { start: isoDate(year, 1, 1), end: isoDate(year, ref.month, day) };
}

function fullYearRange(year: number): DateRange {
  return { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
}

/**
 * Stellt zwei Kalenderjahre gegenüber.
 *
 * @param currentYear   Das Jahr, das im Vordergrund steht.
 * @param referenceYear Das Jahr, gegen das verglichen wird.
 */
export function compareYears(
  payments: readonly AnalyticsPayment[],
  currentYear: number,
  referenceYear: number,
  ref: RefDate,
): PeriodComparison {
  // Sobald **eines** der Jahre noch läuft, wird auf beiden Seiten gekappt.
  // Auch der umgekehrte Fall zählt: Wer ein abgeschlossenes Jahr gegen das
  // laufende stellt, vergleicht sonst ebenso Ungleiches.
  const truncated = currentYear === ref.year || referenceYear === ref.year;

  const currentRange = truncated
    ? truncatedYearRange(currentYear, ref)
    : fullYearRange(currentYear);
  const referenceRange = truncated
    ? truncatedYearRange(referenceYear, ref)
    : fullYearRange(referenceYear);

  const currentTotals = within(payments, currentRange);
  const referenceTotals = within(payments, referenceRange);

  const lastMonth = truncated ? ref.month : 12;
  const months: ComparisonMonth[] = [];
  let currentRunning = Money.zero(EUR);
  let referenceRunning = Money.zero(EUR);

  for (let month = 1; month <= lastMonth; month += 1) {
    const current = monthValue(payments, currentYear, month, currentRange);
    const reference = monthValue(payments, referenceYear, month, referenceRange);
    currentRunning = currentRunning.add(current.net);
    referenceRunning = referenceRunning.add(reference.net);
    months.push({
      month,
      label: monthNameDeShort(month),
      current: { ...current, year: currentYear, month, cumulative: currentRunning },
      reference: {
        ...reference,
        year: referenceYear,
        month,
        cumulative: referenceRunning,
      },
    });
  }

  return {
    current: {
      label: String(currentYear),
      range: currentRange,
      net: currentTotals.net,
      count: currentTotals.count,
    },
    reference: {
      label: String(referenceYear),
      range: referenceRange,
      net: referenceTotals.net,
      count: referenceTotals.count,
    },
    change: comparePeriods(currentTotals.net, referenceTotals.net),
    months,
    truncated,
    cutoff: truncated ? isoFromRef(ref) : currentRange.end,
  };
}

/**
 * Nettosumme eines Kalendermonats, begrenzt auf den Vergleichsbereich, samt der
 * Angabe, ob der Monat dabei angeschnitten wurde.
 */
function monthValue(
  payments: readonly AnalyticsPayment[],
  year: number,
  month: number,
  range: DateRange,
): { net: Money; complete: boolean } {
  const first = isoDate(year, month, 1);
  const last = isoDate(year, month, lastDayOfMonth(year, month));
  const inside = payments.filter(
    (payment) =>
      payment.payDate >= first &&
      payment.payDate <= last &&
      payment.payDate >= range.start &&
      payment.payDate <= range.end,
  );
  return {
    net: aggregate(inside).net,
    complete: first >= range.start && last <= range.end,
  };
}

/**
 * Stellt die letzten zwölf Monate den zwölf davor gegenüber.
 *
 * Beantwortet „laufe ich besser als im Jahr davor?", ohne am Jahreswechsel zu
 * hängen: Im Januar sagt ein Jahresvergleich fast nichts, ein rollierender
 * Zwölfmonatsvergleich dagegen weiterhin alles.
 *
 * Beide Fenster sind exakt zwölf Monate lang und enden am selben Kalendertag.
 */
export function compareRollingTwelveMonths(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): PeriodComparison {
  const currentRange = rollingRange(ref, 0);
  const referenceRange = rollingRange(ref, 12);

  const currentTotals = within(payments, currentRange);
  const referenceTotals = within(payments, referenceRange);

  // Die Monatsreihe folgt hier dem Fenster, nicht dem Kalender: Sie beginnt im
  // Monat nach dem Startpunkt und laeuft zwoelf Monate.
  const months: ComparisonMonth[] = [];
  let currentRunning = Money.zero(EUR);
  let referenceRunning = Money.zero(EUR);

  for (let offset = 11; offset >= 0; offset -= 1) {
    const currentSlot = monthSlot(ref, offset);
    const referenceSlot = monthSlot(ref, offset + 12);
    const current = monthValue(
      payments,
      currentSlot.year,
      currentSlot.month,
      currentRange,
    );
    const reference = monthValue(
      payments,
      referenceSlot.year,
      referenceSlot.month,
      referenceRange,
    );
    currentRunning = currentRunning.add(current.net);
    referenceRunning = referenceRunning.add(reference.net);
    months.push({
      month: currentSlot.month,
      label: monthNameDeShort(currentSlot.month),
      current: { ...current, ...currentSlot, cumulative: currentRunning },
      reference: { ...reference, ...referenceSlot, cumulative: referenceRunning },
    });
  }

  return {
    current: {
      label: "Letzte 12 Monate",
      range: currentRange,
      net: currentTotals.net,
      count: currentTotals.count,
    },
    reference: {
      label: "12 Monate davor",
      range: referenceRange,
      net: referenceTotals.net,
      count: referenceTotals.count,
    },
    change: comparePeriods(currentTotals.net, referenceTotals.net),
    months,
    truncated: false,
    cutoff: currentRange.end,
  };
}

/** Monat und Jahr `offset` Monate vor dem Referenzmonat. */
function monthSlot(ref: RefDate, offset: number): { year: number; month: number } {
  const index = ref.year * 12 + (ref.month - 1) - offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Zwölfmonatsfenster, das `monthsBack` Monate vor dem Referenzmonat endet.
 * Das Fenster endet am Referenztag (bzw. am letzten Tag des Monats, wenn
 * dieser kürzer ist) und beginnt am Tag danach zwölf Monate früher.
 */
function rollingRange(ref: RefDate, monthsBack: number): DateRange {
  const end = monthSlot(ref, monthsBack);
  const endDay = Math.min(ref.day, lastDayOfMonth(end.year, end.month));
  const start = monthSlot(ref, monthsBack + 11);
  return {
    start: isoDate(start.year, start.month, 1),
    end: isoDate(end.year, end.month, endDay),
  };
}
