import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Kernablauf 5: Sicherung erstellen.
 *
 * Der teuerste Fehler dieses Projekts war eine Sicherung, die Erfolg meldete,
 * ohne eine Datei zu erzeugen (docs/AUDIT_2026-07-29.md §3.1). Der Test prüft
 * deshalb nicht die Meldung, sondern die **Datei**: Sie muss entstehen, den
 * vollständigen Bestand enthalten und die Zählwerte im Integritätsblock müssen
 * zur Datenbank passen. Zusätzlich wird der Sicherungsstand fortgeschrieben
 * (§3.7).
 */
test.use({
  seed: {
    payments: [
      { payDate: "2026-01-15", netAmount: "10.00" },
      { payDate: "2026-04-15", netAmount: "20.00" },
      { payDate: "2026-07-15", netAmount: "30.00" },
    ],
  },
});

interface Sicherung {
  format_version: number;
  data: {
    dividend_payments: unknown[];
    depots: unknown[];
    securities: unknown[];
    security_snapshot_runs: { as_of: string }[];
    security_snapshots: { as_of: string; market_value?: string }[];
  };
  integrity: { record_counts: Record<string, number> };
}

test("erstellt eine vollständige Sicherungsdatei", async ({ page, konto }) => {
  // Ein Depotstand im Bestand. Er ist der einzige Datensatz des Projekts, den
  // niemand nachbeschaffen kann — DivvyDiary liefert immer nur den heutigen
  // Stand (docs/PORTFOLIO_IMPORT.md). Fehlte er in der Datei, wäre der Verlust
  // nach einer Wiederherstellung endgültig.
  await asUser(konto.userId, async (client) => {
    await client.query(
      `with r as (
         insert into security_snapshot_runs (as_of, source, file_name, rows_total,
                                             rows_imported)
         values ('2026-08-03', 'divvydiary_csv', 'portfolio-1754236800000.csv', 1, 1)
         returning id
       )
       insert into security_snapshots (security_id, run_id, as_of, quantity, price,
                                       market_value, annual_dividend_total, currency)
       select $1, r.id, '2026-08-03', 12.5, 96.40, 1205.00, 37.60, 'EUR' from r`,
      [konto.securityId],
    );
  });

  await page.goto("/#/einstellungen/datensicherung");
  await expect(page.getByRole("heading", { name: "Sicherung erstellen" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sicherung jetzt erstellen" }).click();

  // 1. Es entsteht wirklich eine Datei.
  const datei = await download;
  expect(datei.suggestedFilename()).toMatch(/\.json$/);

  const pfad = await datei.path();
  const inhalt = JSON.parse(
    await (await import("node:fs/promises")).readFile(pfad, "utf8"),
  ) as Sicherung;

  // 2. Sie enthält den vollständigen Bestand …
  expect(inhalt.data.dividend_payments).toHaveLength(3);
  expect(inhalt.data.depots).toHaveLength(1);
  expect(inhalt.data.securities).toHaveLength(1);

  // 2b. … einschließlich der Depotstände und ihres Uploads (Formatversion 2).
  expect(inhalt.format_version).toBe(2);
  expect(inhalt.data.security_snapshot_runs).toHaveLength(1);
  expect(inhalt.data.security_snapshots).toHaveLength(1);
  expect(inhalt.data.security_snapshots[0]?.as_of).toBe("2026-08-03");
  // `numeric` kommt über PostgREST als JSON-Zahl an; in der Datei muss ein
  // kanonischer Dezimalstring stehen.
  expect(inhalt.data.security_snapshots[0]?.market_value).toBe("1205.00");

  // 3. … und der Integritätsblock stimmt mit der Datenbank überein.
  const anzahl = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ anzahl: string }>(
      "select count(*)::text as anzahl from dividend_payments",
    );
    return Number(result.rows[0]?.anzahl ?? "0");
  });
  expect(inhalt.integrity.record_counts.dividend_payment).toBe(anzahl);

  // 4. Der Sicherungsstand wird fortgeschrieben.
  await expect(page.getByText("Sicherung erstellt und heruntergeladen.")).toBeVisible();
  const lastBackup = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ last_backup_at: string | null }>(
      "select last_backup_at from profiles where id = $1",
      [konto.userId],
    );
    return result.rows[0]?.last_backup_at ?? null;
  });
  expect(lastBackup).not.toBeNull();
});
