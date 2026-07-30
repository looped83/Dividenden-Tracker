import { expect, test } from "../support/appTest";

/**
 * Kernablauf 1: eine Dividende erfassen.
 *
 * Der Test geht denselben Weg wie ein Nutzer — Formular ausfüllen, speichern —
 * und prüft anschließend, dass die Zahl in der Liste **und** in der Übersicht
 * ankommt. Geschrieben wird dabei in die echte Datenbank: Trigger (Fingerprint,
 * `updated_at`, Audit) und RLS laufen mit.
 */
test("erfasst eine Dividende und zeigt sie in Liste und Übersicht", async ({
  page,
  konto,
}) => {
  await page.goto("/#/eingaenge/neu");
  await expect(page.getByRole("heading", { name: "Neue Dividende" })).toBeVisible();

  // Rollenbasiert statt über das Label: In der Navigation steht ebenfalls
  // „Unternehmen", und „Depot" steckt in „Depots".
  await page.getByRole("combobox", { name: "Unternehmen" }).fill("Muster");
  await page.getByRole("option", { name: konto.securityName }).click();

  await page
    .getByRole("combobox", { name: "Depot", exact: true })
    .selectOption({ label: `${konto.depotName} (EUR)` });
  await page.getByLabel("Zahlungsdatum").fill("2026-05-14");
  await page.getByLabel("Nettobetrag").fill("123,45");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Nach dem Speichern führt der Weg zurück in die Liste, mit Rückmeldung.
  await expect(page).toHaveURL(/#\/eingaenge$/);
  await expect(page.getByText("Dividende erfasst.")).toBeVisible();
  await expect(page.getByText("123,45").first()).toBeVisible();

  // Und die Übersicht rechnet den neuen Eingang mit.
  await page.goto("/#/?year=2026");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByText("123,45").first()).toBeVisible();
});

test("weist unvollständige Eingaben zurück, statt sie zu speichern", async ({ page }) => {
  await page.goto("/#/eingaenge/neu");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Die Meldungen stehen am Feld; gespeichert wird nichts (keine Navigation).
  await expect(page.getByText("Unternehmen ist erforderlich")).toBeVisible();
  await expect(page.getByText("Depot ist erforderlich")).toBeVisible();
  await expect(page).toHaveURL(/#\/eingaenge\/neu$/);
});
