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
  await page.getByRole("combobox", { name: "Asset" }).fill("Muster");
  await page.getByRole("option", { name: konto.securityName }).click();

  // Das Depot ergibt sich aus dem Asset (hier: das einzige Depot des Kontos).
  await expect(page.getByRole("combobox", { name: "Depot", exact: true })).toHaveCount(0);
  await page.getByLabel("Zahlungsdatum").fill("2026-05-14");
  await page.getByLabel("Nettobetrag").fill("123,45");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Nach dem Speichern führt der Weg zurück in die Liste, mit Rückmeldung.
  await expect(page).toHaveURL(/#\/eingaenge$/);
  await expect(page.getByText("Dividende erfasst.")).toBeVisible();
  await expect(page.getByText("123,45").first()).toBeVisible();

  // Und die Übersicht rechnet den neuen Eingang mit.
  await page.goto("/#/?year=2026");
  await expect(page.getByRole("heading", { name: "Übersicht", level: 1 })).toBeVisible();
  await expect(page.getByText("123,45").first()).toBeVisible();
});

test("weist unvollständige Eingaben zurück, statt sie zu speichern", async ({ page }) => {
  await page.goto("/#/eingaenge/neu");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Die Meldungen stehen am Feld; gespeichert wird nichts (keine Navigation).
  await expect(page.getByText("Asset ist erforderlich")).toBeVisible();
  await expect(page).toHaveURL(/#\/eingaenge\/neu$/);
});

test("erfasst auf breiten Schirmen im Overlay, ohne die Seite zu verlassen", async ({
  page,
  konto,
}) => {
  // Feste, breite Fenstergroesse statt der Vorgabe des Projekts: Geprueft wird
  // das Verhalten dieser Breite, nicht die Geometrie eines Geraets.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/statistiken");
  await expect(page.getByRole("heading", { name: "Statistik", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Neue Dividende" }).first().click();

  // Das Formular liegt ueber der Seite — die Adresse bleibt, wo sie war.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Neue Dividende" })).toBeVisible();
  await expect(page).toHaveURL(/#\/statistiken$/);

  await dialog.getByRole("combobox", { name: "Asset" }).fill("Muster");
  await page.getByRole("option", { name: konto.securityName }).click();
  await dialog.getByLabel("Zahlungsdatum").fill("2026-05-14");
  await dialog.getByLabel("Nettobetrag").fill("77,00");
  await dialog.getByRole("button", { name: "Speichern" }).click();

  // Danach schliesst das Overlay und die Statistik steht noch da.
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Dividende erfasst.")).toBeVisible();
  await expect(page).toHaveURL(/#\/statistiken$/);
});

test("erfasst auf dem Telefon in einem Sheet über der aktuellen Seite", async ({
  page,
  konto,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/kalender");
  await expect(page.getByRole("heading", { name: "Kalender", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Neue Dividende erfassen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Neue Dividende" })).toBeVisible();
  await expect(page).toHaveURL(/#\/kalender$/);

  // Das Sheet faehrt von unten ein und liegt dann am Rand, ueber der
  // Bottom-Navigation.
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return Math.round((box?.y ?? 0) + (box?.height ?? 0));
    })
    .toBe(844);

  // Abbrechen schliesst es — der Kalender steht noch da.
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/kalender$/);

  // Und erfassen klappt ebenso, ohne die Seite zu verlassen.
  await page.getByRole("button", { name: "Neue Dividende erfassen" }).click();
  await dialog.getByRole("combobox", { name: "Asset" }).fill("Muster");
  await page.getByRole("option", { name: konto.securityName }).click();
  await dialog.getByLabel("Nettobetrag").fill("12,00");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Dividende erfasst.")).toBeVisible();
  await expect(page).toHaveURL(/#\/kalender$/);
});
