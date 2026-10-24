import { expect, test } from "../support/appTest";

/**
 * Fixkosten eintragen, bearbeiten und löschen: Die Liste landet als JSON am
 * Profil (Migration 0041) und kommt nach dem Neuladen unverändert zurück —
 * mit der Deckung durch den Ø-Monat der letzten zwölf Monate.
 */
test.use({
  seed: {
    // 1.200 € in zwölf Monaten: Ø 100 € im Monat, unabhängig vom Testtag.
    payments: [{ payDate: new Date().toISOString().slice(0, 10), netAmount: "1200.00" }],
  },
});

test("trägt Fixkosten ein, bearbeitet und löscht sie", async ({ page }) => {
  await page.goto("/#/fortschritt");
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Fixkosten eintragen" }).click();
  await dialog.getByLabel("Name").fill("Handy");
  await dialog.getByLabel("Monatsbetrag (€)").fill("30");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await dialog.getByLabel("Name").fill("Miete");
  await dialog.getByLabel("Monatsbetrag (€)").fill("900");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByText("deckt 11 % deiner Fixkosten")).toBeVisible();
  const liste = page.getByRole("region", { name: "Was deine Dividenden bezahlen" });
  // Eingeklappt: nur „Als Nächstes" ist zu sehen, Gedecktes klappt auf.
  await expect(liste.getByRole("link")).toHaveCount(1);
  await expect(liste.getByRole("link")).toContainText("noch 830 €");
  await liste.getByRole("button", { name: /Gedeckt/ }).click();
  await expect(liste.getByRole("link", { name: /Handy/ })).toContainText("gedeckt");

  await liste.getByRole("link", { name: /Miete/ }).click();
  await expect(page.getByRole("heading", { name: "Miete" })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await dialog.getByLabel("Monatsbetrag (€)").fill("800");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("noch 730 €")).toBeVisible();

  await page.getByRole("button", { name: "Löschen" }).click();
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(page).toHaveURL(/#\/fortschritt$/);
  await page.reload();
  await expect(liste.getByRole("link")).toHaveCount(0);
  await expect(liste.getByRole("button", { name: /Gedeckt/ })).toContainText("1 · 30 €");
});
