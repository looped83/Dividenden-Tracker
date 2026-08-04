import { formatMoney, formatPercent, NOT_AVAILABLE } from "@/lib/money";
import type { ComparisonResult, YearSelection } from "@/lib/statistics";
import { monthNameDe } from "@/lib/statistics";
import type { PaymentSource } from "@/lib/supabase/database.types";

/** Anzeigeinfo zu Unternehmen/Depot fuer Namensaufloesung und Archivstatus. */
export interface EntityInfo {
  name: string;
  archived: boolean;
}

const SOURCE_LABELS: Record<PaymentSource, string> = {
  manual: "Manuell",
  csv_import: "CSV-Import",
  excel_import: "Excel-Import",
  restore: "Wiederherstellung",
};

export function describeSource(source: PaymentSource): string {
  return SOURCE_LABELS[source];
}

/** Kalenderdatum als `29.07.2026` ({@link formatCalendarDate}). */
export { formatCalendarDate as formatIsoDate } from "@/lib/utils/formatDate";

/** „Juli 2026" bzw. „Alle Jahre" fuer die Zeitraumbeschriftung. */
export function describeSelection(selection: YearSelection): string {
  return selection === "all" ? "Alle Jahre" : String(selection);
}

/** „Juli 2026" fuer einen Monatswert. */
export function formatMonthYear(year: number, month: number): string {
  return `${monthNameDe(month)} ${String(year)}`;
}

export type ComparisonTone = "positive" | "negative" | "neutral";

/**
 * Wandelt ein {@link ComparisonResult} in eine anzeigefertige, fachlich
 * korrekte Beschriftung (§6.4). Es entsteht nie eine unendliche oder
 * irrefuehrende Prozentzahl; `contextLabel` benennt den Vergleichszeitraum.
 */
export function describeComparison(
  result: ComparisonResult,
  contextLabel: string,
): { text: string; tone: ComparisonTone } {
  switch (result.kind) {
    case "percent": {
      const isPositive = !result.percent.isNegative();
      const sign = isPositive && !result.percent.isZero() ? "+" : "";
      const percentText = `${sign}${formatPercent(result.percent)}`;
      const absoluteText = formatMoney(result.absolute);
      const absSign = result.absolute.isPositive() ? "+" : "";
      return {
        text: `${absSign}${absoluteText} · ${percentText} ${contextLabel}`,
        tone: result.absolute.isNegative()
          ? "negative"
          : result.absolute.isPositive()
            ? "positive"
            : "neutral",
      };
    }
    case "new":
      return {
        text: `Neu gegenüber Vorjahr (+${formatMoney(result.absolute)})`,
        tone: "positive",
      };
    case "both-zero":
      return { text: "Keine Zahlungen in beiden Zeiträumen", tone: "neutral" };
    case "no-comparison":
      return { text: `Kein Vergleichswert verfügbar ${NOT_AVAILABLE}`, tone: "neutral" };
  }
}

/**
 * Wie {@link describeComparison}, aber auf zwei Zeilen verteilt: der absolute
 * Betrag als Kennzahl, die Prozentzahl in der Zeile darunter.
 *
 * In einer halbbreiten Kachel (zwei je Zeile auf dem Telefon) passt
 * „+12.345,67 € · +593,6 %" nicht in eine Zeile; der Umbruch trennte die
 * Prozentzahl mitten im Mittelpunkt vom Betrag. Getrennt gesetzt traegt jede
 * Zeile genau eine Zahl — und die Kachel liest sich in beiden Breiten gleich.
 */
export function splitComparison(
  result: ComparisonResult,
  contextLabel: string,
): { value: string; caption: string; tone: ComparisonTone } {
  const combined = describeComparison(result, contextLabel);
  switch (result.kind) {
    case "percent": {
      const sign = !result.percent.isNegative() && !result.percent.isZero() ? "+" : "";
      const absSign = result.absolute.isPositive() ? "+" : "";
      return {
        value: `${absSign}${formatMoney(result.absolute)}`,
        caption: `${sign}${formatPercent(result.percent)} ${contextLabel}`.trim(),
        tone: combined.tone,
      };
    }
    case "new":
      return {
        value: `+${formatMoney(result.absolute)}`,
        caption: `neu ${contextLabel}`.trim(),
        tone: combined.tone,
      };
    case "both-zero":
    case "no-comparison":
      return { value: NOT_AVAILABLE, caption: combined.text, tone: combined.tone };
  }
}

/**
 * Baut das Ziel fuer den Drill-down auf die Zahlungsliste (§13). Leere/`all`-
 * Werte werden weggelassen, damit keine unnoetigen Filter entstehen.
 */
export function paymentsListHref(params: {
  year?: YearSelection;
  month?: number;
  securityId?: string;
  depotId?: string;
}): string {
  const search = new URLSearchParams();
  if (params.year !== undefined && params.year !== "all") {
    search.set("year", String(params.year));
  }
  if (params.month !== undefined) search.set("month", String(params.month));
  if (params.securityId) search.set("security", params.securityId);
  if (params.depotId) search.set("depot", params.depotId);
  const query = search.toString();
  return query ? `/eingaenge?${query}` : "/eingaenge";
}
