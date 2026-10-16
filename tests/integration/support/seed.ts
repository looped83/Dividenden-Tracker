import type { PoolClient } from "pg";
import { firstRow } from "./db";

export interface DividendPaymentRow {
  id: string;
  user_id: string;
  security_id: string;
  depot_id: string;
  pay_date: string;
  gross_amount: string;
  net_amount: string;
  withholding_tax: string;
  domestic_tax: string;
  solidarity_surcharge: string | null;
  church_tax: string | null;
  fees: string | null;
  original_currency: string;
  original_gross: string | null;
  original_net: string | null;
  fx_rate: string | null;
  quantity: string | null;
  amount_per_share: string | null;
  payment_type: string;
  source: string;
  import_id: string | null;
  source_file_name: string | null;
  source_row_number: number | null;
  row_fingerprint: string | null;
  business_fingerprint: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archive_reason: string | null;
}

/** Legt fuer einen Nutzer ein Depot an und liefert dessen id. */
export async function seedDepot(client: PoolClient, name = "Testdepot"): Promise<string> {
  const result = await client.query<{ id: string }>(
    "insert into depots (name) values ($1) returning id",
    [name],
  );
  return firstRow(result).id;
}

/** Legt ein Wertpapier an und liefert dessen id. */
export async function seedSecurity(
  client: PoolClient,
  overrides: { name?: string; isin?: string | null; ticker?: string | null } = {},
): Promise<string> {
  const name = overrides.name ?? "Muster AG";
  const isin = overrides.isin ?? null;
  const ticker = overrides.ticker ?? null;
  const result = await client.query<{ id: string }>(
    "insert into securities (name, isin, ticker) values ($1, $2, $3) returning id",
    [name, isin, ticker],
  );
  return firstRow(result).id;
}

interface SeedPaymentOverrides {
  securityId: string;
  depotId: string;
  payDate?: string;
  grossAmount?: string;
  netAmount?: string;
  originalCurrency?: string;
  source?: "manual" | "csv_import" | "excel_import" | "restore";
  paymentType?: string;
  importId?: string | null;
  sourceRowNumber?: number | null;
  rowFingerprint?: string | null;
}

/** Legt einen Dividendeneingang an und liefert die vollstaendige Zeile. */
export async function seedPayment(
  client: PoolClient,
  overrides: SeedPaymentOverrides,
): Promise<DividendPaymentRow> {
  const payDate = overrides.payDate ?? "2025-06-15";
  const grossAmount = overrides.grossAmount ?? "100.00";
  const netAmount = overrides.netAmount ?? "85.00";
  const originalCurrency = overrides.originalCurrency ?? "EUR";
  const source = overrides.source ?? "manual";
  const paymentType = overrides.paymentType ?? "regular";
  const withholdingTax = (Number(grossAmount) - Number(netAmount)).toFixed(2);

  const result = await client.query<DividendPaymentRow>(
    `insert into dividend_payments
       (security_id, depot_id, pay_date, gross_amount, net_amount,
        withholding_tax, original_currency, source, payment_type,
        import_id, source_row_number, row_fingerprint)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning *`,
    [
      overrides.securityId,
      overrides.depotId,
      payDate,
      grossAmount,
      netAmount,
      withholdingTax,
      originalCurrency,
      source,
      paymentType,
      overrides.importId ?? null,
      overrides.sourceRowNumber ?? null,
      overrides.rowFingerprint ?? null,
    ],
  );
  return firstRow(result);
}
