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
  data: {
    dividend_payments: unknown[];
    depots: unknown[];
    securities: unknown[];
  };
  integrity: { record_counts: Record<string, number> };
}

test("erstellt eine vollständige Sicherungsdatei", async ({ page, konto }) => {
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
