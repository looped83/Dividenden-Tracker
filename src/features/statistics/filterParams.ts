import type { PaymentSource, PaymentType, StatisticsFilter } from "@/lib/statistics";

/**
 * Reine Serialisierung/Validierung der URL-Parameter des Statistikfilters
 * (Phase 5B, §11). Ohne React-/Supabase-Abhaengigkeit, damit isoliert testbar.
 * Gueltige, kombinierbare Kriterien bleiben nach Reload und ueber Browser-
 * Zurueck/-Vorwaerts erhalten; unbekannte Werte fallen sicher auf „kein Filter".
 *
 * Parameterschluessel: `year`, `security`, `depot`, `source`, `type`. Sie sind
 * mit den Drill-down-Zielen der Zahlungsliste (`paymentsListHref`) kompatibel.
 */

const EARLIEST_YEAR = 1970; // pay_date-Constraint (DATA_MODEL.md §3.5)
const CURRENT_YEAR = new Date().getFullYear();

const SOURCES: readonly PaymentSource[] = [
  "manual",
  "csv_import",
  "excel_import",
  "restore",
];
const PAYMENT_TYPES: readonly PaymentType[] = [
  "regular",
  "special",
  "correction",
  "cancellation",
  "refund",
  "other",
];

function parseYear(raw: string | null): number | null {
  if (raw !== null && /^\d{4}$/.test(raw)) {
    const year = Number.parseInt(raw, 10);
    if (year >= EARLIEST_YEAR && year <= CURRENT_YEAR) return year;
  }
  return null;
}

function parseId(raw: string | null): string | null {
  return raw && raw.length > 0 ? raw : null;
}

function parseSource(raw: string | null): PaymentSource | null {
  return raw !== null && SOURCES.includes(raw as PaymentSource)
    ? (raw as PaymentSource)
    : null;
}

function parseType(raw: string | null): PaymentType | null {
  return raw !== null && PAYMENT_TYPES.includes(raw as PaymentType)
    ? (raw as PaymentType)
    : null;
}

export function parseStatisticsFilter(params: URLSearchParams): StatisticsFilter {
  return {
    year: parseYear(params.get("year")),
    securityId: parseId(params.get("security")),
    depotId: parseId(params.get("depot")),
    source: parseSource(params.get("source")),
    paymentType: parseType(params.get("type")),
  };
}

/**
 * Schreibt den Filter in eine URLSearchParams-Instanz. Nicht gesetzte (`null`)
 * Kriterien werden entfernt, sodass die URL nur aktive Filter enthaelt. Andere
 * (fremde) Parameter bleiben unangetastet.
 */
export function applyStatisticsFilter(
  params: URLSearchParams,
  filter: StatisticsFilter,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set("year", filter.year !== null ? String(filter.year) : null);
  set("security", filter.securityId);
  set("depot", filter.depotId);
  set("source", filter.source);
  set("type", filter.paymentType);
  return next;
}

export const EMPTY_STATISTICS_FILTER: StatisticsFilter = {
  year: null,
  securityId: null,
  depotId: null,
  source: null,
  paymentType: null,
};
