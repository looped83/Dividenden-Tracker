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

test("trägt Fixkosten ein, bearbeitet und löscht sie", async ({ page }, testInfo) => {
  await page.goto("/#/fortschritt");
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Fixkosten eintragen" }).click();
  await dialog.getByLabel("Name").fill("Handy");
  await dialog.getByLabel("Monatsbetrag (€)").fill("29,95");
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
  await expect(liste.getByRole("listitem")).toHaveCount(1);
  await expect(liste.getByRole("listitem")).toContainText("noch 829,95 €");
  await liste.getByRole("button", { name: /Gedeckt/ }).click();
  await expect(liste.getByRole("link", { name: /Handy/ })).toContainText("gedeckt");

  await liste.getByRole("link", { name: /Miete/ }).click();
  await expect(page.getByRole("heading", { name: "Miete" })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await dialog.getByLabel("Monatsbetrag (€)").fill("800");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("noch 729,95 €")).toBeVisible();
  // Zurück zum Fortschritt bleibt „Gedeckt" aufgeklappt (seit 2.17.1).
  await page.getByRole("link", { name: "Zum Fortschritt" }).click();
  await expect(liste.getByRole("link", { name: /Handy/ })).toBeVisible();
  await liste.getByRole("link", { name: /Miete/ }).click();

  await page.getByRole("button", { name: "Löschen" }).click();
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(page).toHaveURL(/#\/fortschritt(\?|$)/);
  await page.reload();
  // „Gedeckt" bleibt nach dem Löschen offen: Handy steht, Miete ist weg.
  await expect(liste.getByRole("link", { name: /Miete/ })).toHaveCount(0);
  await expect(liste.getByRole("button", { name: /Gedeckt/ })).toContainText(
    "1 · 29,95 €",
  );

  // Pflegeseite: alle Positionen, filterbar; ab md als Tabelle mit Stift
  // und Papierkorb, auf dem Telefon führen die Zeilen zur Detailseite.
  await liste.getByRole("link", { name: "Alle Fixkosten" }).click();
  await expect(page.getByRole("heading", { name: "Fixkosten", level: 1 })).toBeVisible();
  const filter = page.getByRole("button", { name: /^Filter/ });
  if (await filter.isVisible()) await filter.click();
  await page.getByLabel("Status").selectOption("open");
  await expect(page.getByText("Keine Fixkosten für diese Filter")).toBeVisible();
  await page.getByLabel("Status").selectOption("covered");
  const positionen = page.getByRole("region", { name: "Positionen" });
  await expect(positionen.getByRole("link", { name: "Handy" })).toBeVisible();

  if (testInfo.project.name === "Desktop") {
    await page.getByRole("button", { name: "Handy bearbeiten" }).click();
    await dialog.getByLabel("Monatsbetrag (€)").fill("25,50");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(positionen.getByRole("cell", { name: "25,50 €" })).toBeVisible();
    await page.getByRole("button", { name: "Handy löschen" }).click();
    await dialog.getByRole("button", { name: "Löschen" }).click();
  } else {
    await positionen.getByRole("link", { name: "Handy" }).click();
    await page.getByRole("button", { name: "Löschen" }).click();
    await dialog.getByRole("button", { name: "Löschen" }).click();
    // Nach dem Löschen geht es im Verlauf zurück zur Pflegeseite (seit 2.17.1).
    await expect(
      page.getByRole("heading", { name: "Fixkosten", level: 1 }),
    ).toBeVisible();
  }
  await expect(page.getByText("Noch keine Fixkosten")).toBeVisible();
});
