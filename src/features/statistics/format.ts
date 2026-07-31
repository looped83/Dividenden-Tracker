import type { EntityInfo } from "@/features/dashboard/format";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { paymentsListHref } from "@/features/dashboard/format";
import type { PaymentSource, StatisticsFilter } from "@/lib/statistics";
import { applyStatisticsFilter } from "./filterParams";

// Die Zahlungsarten stehen in `lib`: Der Datenexport braucht dieselben Namen.
export { describePaymentType, PAYMENT_TYPE_VALUES } from "@/lib/payments/paymentType";

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

/** „1 Zahlung" / „1.439 Zahlungen". */
export function formatPayments(count: number): string {
  return formatCountNoun(count, "Zahlung", "Zahlungen");
}

/** Anzeigename eines Unternehmens/Depots; „Unbekannt", wenn nicht auflösbar. */
export function entityName(map: Map<string, EntityInfo>, id: string): string {
  return map.get(id)?.name ?? "Unbekannt";
}

/** Ist das Unternehmen/Depot archiviert? */
export function entityArchived(map: Map<string, EntityInfo>, id: string): boolean {
  return map.get(id)?.archived ?? false;
}

export const PAYMENT_SOURCE_VALUES: readonly PaymentSource[] = [
  "manual",
  "csv_import",
  "excel_import",
  "restore",
];

export { formatCountNumber, formatCountNoun } from "@/lib/utils/formatNumber";
