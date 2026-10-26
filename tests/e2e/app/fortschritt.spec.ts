import { expect, test } from "../support/appTest";
import { asUser } from "../support/db";
import { seedPortfolio } from "../support/portfolio";

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
  await dialog.getByLabel("Betrag (€)").fill("29,95");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await dialog.getByLabel("Name").fill("Miete");
  await dialog.getByLabel("Betrag (€)").fill("900");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByText("deckt 11 % deiner Fixkosten")).toBeVisible();
  const liste = page.getByRole("region", { name: "Was Dividenden decken" });
  // Eingeklappt: nur „Als Nächstes" ist zu sehen, Gedecktes klappt auf.
  await expect(liste.getByRole("listitem")).toHaveCount(1);
  await expect(liste.getByRole("listitem")).toContainText("noch 829,95 €");
  await liste.getByRole("button", { name: /Gedeckt/ }).click();
  await expect(liste.getByRole("link", { name: /Handy/ })).toContainText("gedeckt");

  await liste.getByRole("link", { name: /Miete/ }).click();
  await expect(page.getByRole("heading", { name: "Miete" })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await dialog.getByLabel("Betrag (€)").fill("800");
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
    await dialog.getByLabel("Betrag (€)").fill("25,50");
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

/**
 * Kaufpreis zurückverdient: erhaltene Dividenden je Asset gegen den Einstand
 * des jüngsten Depotstands (CALCULATION_RULES.md §15.3).
 */
test("zeigt, wie viel vom Kaufpreis zurückverdient ist", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await asUser(konto.userId, async (client) => {
    await client.query(
      `insert into dividend_payments
         (security_id, depot_id, pay_date, gross_amount, net_amount,
          withholding_tax, domestic_tax, original_currency, payment_type, source)
       select id, $1, '2026-06-15', 2600, 2600, 0, 0, 'EUR', 'regular', 'manual'
         from securities where name = 'Allianz'`,
      [konto.depotId],
    );
    // Ein langer Name darf die Seite auf dem Telefon nicht verbreitern (2.18.1).
    await client.query(
      `update securities set name = 'Vanguard FTSE All-World High Dividend Yield UCITS ETF'
        where name = 'BASF'`,
    );
  });

  await page.goto("/#/fortschritt");
  const bereich = page.getByRole("region", { name: "Kaufpreis zurückverdient" });
  // Allianz: 2.600 € von 5.200 € Einstand — die Hälfte, als Nächstes offen.
  await expect(bereich.getByRole("link", { name: /Allianz/ })).toContainText(
    "50 % zurück · noch 2.600 €",
  );
  await bereich.getByRole("button", { name: /Unter der Hälfte/ }).click();
  await expect(bereich.getByRole("link", { name: /Vanguard FTSE/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await bereich.getByRole("link", { name: /Allianz/ }).click();
  await expect(page.getByRole("heading", { name: "Allianz" })).toBeVisible();
  await page.getByRole("link", { name: "Zum Fortschritt" }).click();
  await expect(bereich).toBeVisible();
});

/**
 * Fixkosten mit Rhythmus (seit 2.34.0): Eine jährliche Position zählt mit
 * einem Zwölftel, die Pflegeseite nennt den Jahresbetrag.
 */
test("rechnet jährliche Fixkosten auf den Monat um", async ({ page }, testInfo) => {
  await page.goto("/#/fortschritt");
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Fixkosten eintragen" }).click();
  await dialog.getByLabel("Name").fill("Kfz-Versicherung");
  await dialog.getByLabel("Betrag (€)").fill("1.320");
  await dialog.getByLabel("Rhythmus").selectOption("12");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  const liste = page.getByRole("region", { name: "Was Dividenden decken" });
  // 110 € im Monat gegen Ø 100 €: als Nächstes, noch 10 €.
  await expect(liste.getByRole("listitem")).toContainText("noch 10,00 €");
  await expect(liste.getByRole("listitem")).toContainText("110,00 €");

  await liste.getByRole("link", { name: "Alle Fixkosten" }).click();
  const positionen = page.getByRole("region", { name: "Positionen" });
  if (testInfo.project.name === "Desktop") {
    await expect(positionen.getByRole("cell", { name: "1.320,00 €" })).toBeVisible();
  } else {
    await expect(positionen.getByText("1.320,00 € jährlich")).toBeVisible();
  }

  await positionen.getByRole("link", { name: "Kfz-Versicherung" }).click();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("1.320");
  await expect(dialog.getByLabel("Rhythmus")).toHaveValue("12");
});
