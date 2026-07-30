import type { PaymentSource } from "@/lib/supabase/database.types";

/** Fachliche Bezeichnung der Datenquelle (§1, DATA_DICTIONARY.md). */
export const SOURCE_LABELS: Record<PaymentSource, string> = {
  manual: "Manuell",
  csv_import: "CSV-Import",
  excel_import: "Excel-Import",
  restore: "Wiederhergestellt",
};

export function sourceLabel(source: PaymentSource): string {
  return SOURCE_LABELS[source];
}

export function isImported(source: PaymentSource): boolean {
  return source === "csv_import" || source === "excel_import";
}

export {
  formatTimestampDate as formatDate,
  formatTimestamp as formatDateTime,
} from "@/lib/utils/formatDate";
