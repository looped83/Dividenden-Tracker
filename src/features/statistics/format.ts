import type { EntityInfo } from "@/features/dashboard/format";
import { paymentsListHref } from "@/features/dashboard/format";
import type { PaymentSource, PaymentType, StatisticsFilter } from "@/lib/statistics";
import { applyStatisticsFilter } from "./filterParams";

export {
  describeSource,
  formatIsoDate,
  formatMonthYear,
  describeComparison,
  paymentsListHref,
  type EntityInfo,
  type ComparisonTone,
} from "@/features/dashboard/format";

/**
 * Drill-down-Ziel in die Zahlungsliste (§13). Der aktive Statistikfilter
 * (Unternehmen/Depot/Jahr) wird mit den konkreten Drill-Kriterien
 * zusammengefuehrt, sodass die Zielliste dieselbe Teilmenge wie die Kennzahl
 * zeigt. `overrides` haben Vorrang vor dem Filter. Quelle/Zahlungsart lassen
 * sich in der Zahlungsliste nicht filtern und bleiben daher unberücksichtigt.
 */
export function statisticsDrillHref(
  filter: StatisticsFilter,
  overrides: {
    year?: number;
    month?: number;
    securityId?: string;
    depotId?: string;
  } = {},
): string {
  const params: {
    year?: number;
    month?: number;
    securityId?: string;
    depotId?: string;
  } = {};
  const year = overrides.year ?? filter.year;
  if (year !== null) params.year = year;
  if (overrides.month !== undefined) params.month = overrides.month;
  const securityId = overrides.securityId ?? filter.securityId;
  if (securityId) params.securityId = securityId;
  const depotId = overrides.depotId ?? filter.depotId;
  if (depotId) params.depotId = depotId;
  return paymentsListHref(params);
}

/**
 * Ziel eines Statistik-Unterbereichs (Drill-down innerhalb der Statistik, §13),
 * unter Beibehaltung des aktiven Filters. `overrides` ergänzen/überschreiben den
 * Filter (z. B. Jahr beim Sprung „Jahr → Monate dieses Jahres").
 */
export function statisticsTabHref(
  path: string,
  filter: StatisticsFilter,
  overrides: Partial<StatisticsFilter> = {},
): string {
  const params = applyStatisticsFilter(new URLSearchParams(), {
    ...filter,
    ...overrides,
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

const countFormatter = new Intl.NumberFormat("de-DE");

/** Ganzzahl in deutscher Schreibweise (Tausenderpunkt). */
export function formatCountNumber(count: number): string {
  return countFormatter.format(count);
}

/** „1 Zahlung" / „12 Zahlungen". */
export function formatPayments(count: number): string {
  return `${countFormatter.format(count)} ${count === 1 ? "Zahlung" : "Zahlungen"}`;
}

/** Anzeigename eines Unternehmens/Depots; „Unbekannt", wenn nicht auflösbar. */
export function entityName(map: Map<string, EntityInfo>, id: string): string {
  return map.get(id)?.name ?? "Unbekannt";
}

/** Ist das Unternehmen/Depot archiviert? */
export function entityArchived(map: Map<string, EntityInfo>, id: string): boolean {
  return map.get(id)?.archived ?? false;
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  regular: "Regulär",
  special: "Sonderdividende",
  correction: "Korrektur",
  cancellation: "Stornierung",
  refund: "Erstattung",
  other: "Sonstige",
};

export function describePaymentType(type: PaymentType): string {
  return PAYMENT_TYPE_LABELS[type];
}

export const PAYMENT_SOURCE_VALUES: readonly PaymentSource[] = [
  "manual",
  "csv_import",
  "excel_import",
  "restore",
];

export const PAYMENT_TYPE_VALUES: readonly PaymentType[] = [
  "regular",
  "special",
  "correction",
  "cancellation",
  "refund",
  "other",
];
