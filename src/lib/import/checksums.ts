import { MoneyDecimal, type DecimalInstance } from "@/lib/money/decimalConfig";

/**
 * Kontrollsummen fuer den Import (IMPORT_SPEC.md §8, §13, §23). Alle Summen
 * werden ausschliesslich ueber Decimal.js gebildet — kein Floating Point.
 */

export interface ChecksumRow {
  /** ISO-Datum YYYY-MM-DD. */
  payDate: string;
  /** Kanonischer Dezimalstring. */
  netAmount: string;
  /** Normalisierter/Original-Brokername (fuer Gruppierung). */
  broker: string;
}

export interface YearBucket {
  count: number;
  sum: string;
}

export interface ImportChecksums {
  rowCount: number;
  totalNet: string;
  minDate: string | null;
  maxDate: string | null;
  byYear: Record<string, YearBucket>;
  byBroker: Record<string, { count: number; sum: string }>;
}

export function computeChecksums(rows: ChecksumRow[]): ImportChecksums {
  let total: DecimalInstance = new MoneyDecimal(0);
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const byYear = new Map<string, { count: number; sum: DecimalInstance }>();
  const byBroker = new Map<string, { count: number; sum: DecimalInstance }>();

  for (const row of rows) {
    const amount = new MoneyDecimal(row.netAmount);
    total = total.plus(amount);

    if (minDate === null || row.payDate < minDate) minDate = row.payDate;
    if (maxDate === null || row.payDate > maxDate) maxDate = row.payDate;

    const year = row.payDate.slice(0, 4);
    const yearBucket = byYear.get(year) ?? { count: 0, sum: new MoneyDecimal(0) };
    yearBucket.count += 1;
    yearBucket.sum = yearBucket.sum.plus(amount);
    byYear.set(year, yearBucket);

    const brokerBucket = byBroker.get(row.broker) ?? {
      count: 0,
      sum: new MoneyDecimal(0),
    };
    brokerBucket.count += 1;
    brokerBucket.sum = brokerBucket.sum.plus(amount);
    byBroker.set(row.broker, brokerBucket);
  }

  const byYearOut: Record<string, YearBucket> = {};
  for (const [year, bucket] of [...byYear.entries()].sort()) {
    byYearOut[year] = { count: bucket.count, sum: bucket.sum.toFixed(2) };
  }
  const byBrokerOut: Record<string, { count: number; sum: string }> = {};
  for (const [broker, bucket] of byBroker.entries()) {
    byBrokerOut[broker] = { count: bucket.count, sum: bucket.sum.toFixed(2) };
  }

  return {
    rowCount: rows.length,
    totalNet: total.toFixed(2),
    minDate,
    maxDate,
    byYear: byYearOut,
    byBroker: byBrokerOut,
  };
}
