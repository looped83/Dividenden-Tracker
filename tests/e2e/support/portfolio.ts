import { asUser } from "./db";

/**
 * Ein Depotstand mit gemischtem Bestand fuer die Analyse: Aktien und ETFs,
 * mehrere Ausschuettungswaehrungen und Rhythmen, Branchen und Laender aus
 * mehreren Regionen — und ein thesaurierender ETF ohne Angaben.
 */
const POSITIONEN = [
  ["Realty Income", "US", "Real Estate", "USD", "monthly", "equity", "4200.00", "230.00"],
  [
    "Microsoft",
    "US",
    "Information Technology",
    "USD",
    "quarterly",
    "equity",
    "6800.00",
    "52.00",
  ],
  [
    "Johnson & Johnson",
    "US",
    "Health Care",
    "USD",
    "quarterly",
    "equity",
    "3900.00",
    "120.00",
  ],
  [
    "Procter & Gamble",
    "US",
    "Consumer Staples",
    "USD",
    "quarterly",
    "equity",
    "3500.00",
    "95.00",
  ],
  ["Allianz", "DE", "Financials", "EUR", "annually", "equity", "5200.00", "240.00"],
  [
    "Münchener Rück",
    "DE",
    "Financials",
    "EUR",
    "annually",
    "equity",
    "4100.00",
    "150.00",
  ],
  ["BASF", "DE", "Materials", "EUR", "annually", "equity", "1800.00", "115.00"],
  [
    "Unilever",
    "GB",
    "Consumer Staples",
    "GBP",
    "quarterly",
    "equity",
    "2600.00",
    "95.00",
  ],
  ["Nestlé", "CH", "Consumer Staples", "CHF", "annually", "equity", "2900.00", "90.00"],
  ["TotalEnergies", "FR", "Energy", "EUR", "quarterly", "equity", "2200.00", "125.00"],
  [
    "Novo Nordisk",
    "DK",
    "Health Care",
    "DKK",
    "biannually",
    "equity",
    "2100.00",
    "35.00",
  ],
  [
    "Toyota",
    "JP",
    "Consumer Discretionary",
    "JPY",
    "biannually",
    "equity",
    "1500.00",
    "40.00",
  ],
  ["Vanguard High Dividend", null, null, "USD", "quarterly", "etf", "7500.00", "260.00"],
  ["iShares MSCI World", null, null, null, "none", "etf", "9000.00", null],
] as const;

export async function seedPortfolio(userId: string, asOf = "2026-10-15"): Promise<void> {
  await asUser(userId, async (client) => {
    const run = await client.query<{ id: string }>(
      `insert into security_snapshot_runs (as_of, rows_total, rows_imported)
       values ($1, $2, $2) returning id`,
      [asOf, POSITIONEN.length],
    );
    const runId = run.rows[0]?.id;
    for (const [
      name,
      country,
      sector,
      currency,
      frequency,
      type,
      value,
      dividend,
    ] of POSITIONEN) {
      const security = await client.query<{ id: string }>(
        `insert into securities (name, country, sector, currency)
         values ($1, $2, $3, $4) returning id`,
        [name, country, sector, currency],
      );
      await client.query(
        `insert into security_snapshots
           (security_id, run_id, as_of, quantity, buyin_total, market_value,
            annual_dividend_total, dividend_frequency, asset_type, currency)
         values ($1, $2, $3, 10, $4, $4, $5, $6, $7, 'EUR')`,
        [security.rows[0]?.id, runId, asOf, value, dividend, frequency, type],
      );
    }
  });
}
