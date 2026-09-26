import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Kernablauf 3: stornieren und wieder reaktivieren.
 *
 * Das Stornieren läuft über die RPC `archive_payment` — sie wird hier
 * tatsächlich ausgeführt, samt Bestätigungsdialog und Stornogrund. Anschließend
 * wird geprüft, dass der Eingang aus den Auswertungen verschwindet (Grundsatz:
 * stornierte Zahlungen zählen nirgends mit) und beim Reaktivieren zurückkehrt.
 */
test.use({ seed: { payments: [{ payDate: "2026-02-20", netAmount: "64.00" }] } });

test("storniert einen Eingang mit Grund und reaktiviert ihn wieder", async ({
  page,
  konto,
}) => {
  const id = konto.paymentIds[0] ?? "";
  await page.goto(`/#/eingaenge/${id}`);
  // Aktiv ist der Normalfall und traegt kein Kennzeichen; nur „Storniert"
  // wird ausgewiesen.
  await expect(
    page.getByRole("button", { name: "Stornieren", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Storniert")).toHaveCount(0);

  await page.getByRole("button", { name: "Stornieren", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Dividendeneingang stornieren?" }),
  ).toBeVisible();
  await dialog.getByLabel("Stornogrund (optional)").fill("Doppelt erfasst");
  await dialog.getByRole("button", { name: "Stornieren" }).click();

  await expect(page.getByText("Storniert").first()).toBeVisible();
  await expect(page.getByText("Doppelt erfasst")).toBeVisible();

  const stored = await asUser(konto.userId, async (client) => {
    const result = await client.query<{
      archived_at: string | null;
      archive_reason: string | null;
    }>("select archived_at, archive_reason from dividend_payments where id = $1", [id]);
    return result.rows[0];
  });
  expect(stored?.archived_at).not.toBeNull();
  expect(stored?.archive_reason).toBe("Doppelt erfasst");

  // Der stornierte Eingang zählt in der Übersicht nicht mehr mit.
  await page.goto("/#/?year=2026");
  await expect(page.getByRole("heading", { name: "Übersicht", level: 1 })).toBeVisible();
  await expect(page.getByText("64,00")).toHaveCount(0);

  // Reaktivieren stellt ihn wieder her.
  await page.goto(`/#/eingaenge/${id}`);
  await page.getByRole("button", { name: "Reaktivieren" }).click();
  await expect(
    page.getByRole("button", { name: "Stornieren", exact: true }),
  ).toBeVisible();

  await page.goto("/#/?year=2026");
  await expect(page.getByText("64,00").first()).toBeVisible();
});
