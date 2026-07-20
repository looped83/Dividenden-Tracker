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

/** Deutsches mittleres Datumsformat aus einem ISO-Kalenderdatum. */
export function formatIsoDate(iso: string): string {
  // Reines Kalenderdatum ohne Zeitzonenbezug interpretieren.
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

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
