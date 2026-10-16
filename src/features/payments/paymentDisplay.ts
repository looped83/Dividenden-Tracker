import { EUR, Money } from "@/lib/money";
import type { PaymentSource } from "@/lib/supabase/database.types";

/** Fachliche Bezeichnung der Datenquelle (§1, DATA_DICTIONARY.md). */
const SOURCE_LABELS: Record<PaymentSource, string> = {
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

/**
 * Weicht der gespeicherte Betrag vom importierten ab? Verglichen wird der
 * Wert, nicht der Text: Der Import haelt „12.50" fest, die Datenbank liefert
 * 12.5 — als Text verglichen galt jeder Betrag mit einer Null am Ende als
 * nachtraeglich geaendert. Beide Seiten werden wie beim Speichern auf zwei
 * Stellen gerundet (R-1); aeltere Importe hielten den ungerundeten Quellwert
 * fest.
 */
export function amountDiffers(imported: string, stored: string): boolean {
  try {
    return !Money.fromString(imported, EUR).equals(Money.fromString(stored, EUR));
  } catch {
    // Unlesbarer Ursprungswert: Unterschied anzeigen statt ihn zu verschweigen.
    return imported !== stored;
  }
}
