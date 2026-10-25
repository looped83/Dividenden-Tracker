import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";

/** Eine gehaltene Position mit ihrem Einstand aus dem jüngsten Depotstand. */
export interface PaybackHolding {
  securityId: string;
  name: string;
  /** Einstand der ganzen Position in €, > 0. */
  buyin: Money;
}

export type PaybackStatus = "full" | "half" | "started";

export interface PaybackItem {
  securityId: string;
  name: string;
  buyin: Money;
  /** Netto erhaltene Dividenden dieses Assets, nie negativ. */
  received: Money;
  /** `received ÷ buyin × 100`, nicht begrenzt: über 100 % ist mehr als zurück. */
  percent: DecimalInstance;
  /** Was bis zum ganzen Einstand fehlt; ab 100 % null. */
  missing: Money;
  status: PaybackStatus;
}

export interface PaybackResult {
  /** Höchster Anteil zuerst. */
  items: PaybackItem[];
  buyin: Money;
  received: Money;
  /** Anteil über alle Positionen 0–100+; `null` ohne Positionen. */
  percent: DecimalInstance | null;
  /** Das Asset, das dem ganzen Einstand am nächsten ist. */
  next: PaybackItem | null;
}

const HUNDRED = new MoneyDecimal(100);
const HALF = new MoneyDecimal(50);

function statusOf(percent: DecimalInstance): PaybackStatus {
  if (percent.gte(HUNDRED)) return "full";
  if (percent.gte(HALF)) return "half";
  return "started";
}

/**
 * Wie viel vom Kaufpreis die Dividenden schon zurückgezahlt haben
 * (CALCULATION_RULES.md §15.3): je gehaltener Position die netto erhaltenen
 * Dividenden geteilt durch den Einstand des jüngsten Depotstands.
 */
export function paybackOverview(
  payments: readonly AnalyticsPayment[],
  holdings: readonly PaybackHolding[],
): PaybackResult {
  const receivedBySecurity = new Map<string, DecimalInstance>();
  for (const payment of payments) {
    const sum = receivedBySecurity.get(payment.securityId) ?? new MoneyDecimal(0);
    receivedBySecurity.set(payment.securityId, sum.plus(payment.netAmount.toDecimal()));
  }

  let buyinTotal = new MoneyDecimal(0);
  let receivedTotal = new MoneyDecimal(0);
  const items = holdings
    .filter((holding) => holding.buyin.isPositive())
    .map((holding): PaybackItem => {
      const buyin = holding.buyin.toDecimal();
      // Stornos können die Summe kurz unter null drücken; zurück ist dann nichts.
      const received = MoneyDecimal.max(
        0,
        receivedBySecurity.get(holding.securityId) ?? 0,
      );
      buyinTotal = buyinTotal.plus(buyin);
      receivedTotal = receivedTotal.plus(received);
      const percent = received.div(buyin).times(HUNDRED);
      return {
        securityId: holding.securityId,
        name: holding.name,
        buyin: holding.buyin,
        received: Money.fromDecimal(received, EUR),
        percent,
        missing: Money.fromDecimal(MoneyDecimal.max(0, buyin.minus(received)), EUR),
        status: statusOf(percent),
      };
    })
    .sort(
      (a, b) => b.percent.comparedTo(a.percent) || a.name.localeCompare(b.name, "de"),
    );

  return {
    items,
    buyin: Money.fromDecimal(buyinTotal, EUR),
    received: Money.fromDecimal(receivedTotal, EUR),
    percent: buyinTotal.gt(0) ? receivedTotal.div(buyinTotal).times(HUNDRED) : null,
    next: items.find((item) => item.status !== "full") ?? null,
  };
}
