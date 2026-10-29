import type { Money } from "@/lib/money";
import { aggregate, distinctSecurities } from "./analytics";
import type { AnalyticsPayment } from "./types";

/**
 * Automatisch reinvestierte Dividenden (CALCULATION_RULES.md §11.14, seit
 * 2.38.0): Zahlungen eines Assets ab dem Tag, seit dem der Broker sie
 * reinvestiert (`securities.reinvest_since`), gemessen am Zahltag.
 */
export interface ReinvestedSummary {
  net: Money;
  /** Zahl verschiedener Assets, deren Dividende nachkaufte. */
  securities: number;
}

export function reinvestedSummary(
  payments: readonly AnalyticsPayment[],
  sinceOf: (securityId: string) => string | null | undefined,
): ReinvestedSummary | null {
  const rows = payments.filter((payment) => {
    const since = sinceOf(payment.securityId);
    return Boolean(since) && payment.payDate >= (since ?? "");
  });
  if (rows.length === 0) return null;
  return { net: aggregate(rows).net, securities: distinctSecurities(rows) };
}
