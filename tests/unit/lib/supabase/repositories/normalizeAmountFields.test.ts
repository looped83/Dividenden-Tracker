import { describe, expect, it } from "vitest";
import { normalizeAmountFields } from "@/lib/supabase/repositories/normalizeAmountFields";
import type { Database } from "@/lib/supabase/database.types";

type DividendPayment = Database["public"]["Tables"]["dividend_payments"]["Row"];

const baseRow: DividendPayment = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000004",
  security_id: "00000000-0000-0000-0000-000000000002",
  depot_id: "00000000-0000-0000-0000-000000000003",
  pay_date: "2026-03-15",
  payment_type: "regular",
  gross_amount: "73.63",
  net_amount: "73.63",
  withholding_tax: "0",
  domestic_tax: "0",
  solidarity_surcharge: null,
  church_tax: null,
  fees: null,
  original_currency: "EUR",
  original_gross: null,
  original_net: null,
  fx_rate: null,
  quantity: null,
  amount_per_share: null,
  source: "manual",
  import_id: null,
  source_file_name: null,
  source_row_number: null,
  row_fingerprint: null,
  note: null,
  archived_at: null,
  archive_reason: null,
  business_fingerprint: "fingerprint",
  created_at: "2026-03-15T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
};

describe("normalizeAmountFields", () => {
  it("wandelt von PostgREST als JSON-Zahl gelieferte Betragsfelder in Strings um", () => {
    const row = {
      ...baseRow,
      gross_amount: 73.63,
      net_amount: 73.63,
      withholding_tax: 0,
      domestic_tax: 0,
    } as unknown as DividendPayment;

    const normalized = normalizeAmountFields(row);

    expect(normalized.gross_amount).toBe("73.63");
    expect(normalized.net_amount).toBe("73.63");
    expect(normalized.withholding_tax).toBe("0");
    expect(normalized.domestic_tax).toBe("0");
  });

  it("laesst bereits als String gelieferte Betragsfelder unveraendert", () => {
    const normalized = normalizeAmountFields(baseRow);
    expect(normalized).toEqual(baseRow);
  });

  it("laesst null-Werte in optionalen Betragsfeldern unveraendert", () => {
    const row = { ...baseRow, solidarity_surcharge: null } as DividendPayment;
    const normalized = normalizeAmountFields(row);
    expect(normalized.solidarity_surcharge).toBeNull();
  });
});
