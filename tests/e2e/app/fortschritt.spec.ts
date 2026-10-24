import { expect, test } from "../support/appTest";

/**
 * Fixkosten eintragen: Die Liste landet als JSON am Profil (Migration 0041)
 * und kommt nach dem Neuladen unverändert zurück — mit der Deckung durch den
 * Ø-Monat der letzten zwölf Monate.
 */
test.use({
  seed: {
    // 1.200 € in zwölf Monaten: Ø 100 € im Monat, unabhängig vom Testtag.
    payments: [{ payDate: new Date().toISOString().slice(0, 10), netAmount: "1200.00" }],
  },
});

test("trägt Fixkosten ein und zeigt, welche die Dividende deckt", async ({ page }) => {
  await page.goto("/#/fortschritt");
  await page.getByRole("button", { name: "Fixkosten eintragen" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name der Position 1").fill("Handy");
  await dialog.getByLabel("Monatsbetrag der Position 1 in Euro").fill("30");
  await dialog.getByRole("button", { name: "Position hinzufügen" }).click();
  await dialog.getByLabel("Name der Position 2").fill("Miete");
  await dialog.getByLabel("Monatsbetrag der Position 2 in Euro").fill("900");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByText("deckt 11 % deiner Fixkosten")).toBeVisible();
  const liste = page.getByRole("region", { name: "Was deine Dividenden bezahlen" });
  await expect(liste.getByRole("listitem")).toHaveCount(2);
  await expect(liste.getByRole("listitem").first()).toContainText("gedeckt");
  await expect(liste.getByRole("listitem").nth(1)).toContainText("noch 830 €");
});
