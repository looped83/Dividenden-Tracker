import type { StatisticsFilter } from "@/lib/statistics";

/**
 * Reine Serialisierung/Validierung der URL-Parameter des Statistikfilters
 * (Phase 5B, §11). Ohne React-/Supabase-Abhaengigkeit, damit isoliert testbar.
 * Gueltige, kombinierbare Kriterien bleiben nach Reload und ueber Browser-
 * Zurueck/-Vorwaerts erhalten; unbekannte Werte fallen sicher auf „kein Filter".
 *
 * Parameterschluessel: `year`, `security`, `depot` — genau die drei, die auch
 * die Zahlungsliste kennt (`paymentsListHref`). Damit fuehrt jeder Drill-down
 * in eine Liste, die **dieselbe** Teilmenge zeigt wie die Kennzahl daneben.
 * Quelle und Zahlungsart gab es hier frueher zusaetzlich; sie liessen sich in
 * der Zahlungsliste nicht nachbilden, sodass die Zielliste mehr Zahlungen
 * enthielt als die Zahl, aus der man kam.
 */

const EARLIEST_YEAR = 1970; // pay_date-Constraint (DATA_MODEL.md §3.5)
const CURRENT_YEAR = new Date().getFullYear();

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

export function parseStatisticsFilter(params: URLSearchParams): StatisticsFilter {
  return {
    year: parseYear(params.get("year")),
    securityId: parseId(params.get("security")),
    depotId: parseId(params.get("depot")),
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
  return next;
}

export const EMPTY_STATISTICS_FILTER: StatisticsFilter = {
  year: null,
  securityId: null,
  depotId: null,
};
