import { expect, test } from "../support/appTest";

/**
 * Ziele anlegen und bearbeiten.
 *
 * Der Bearbeiten-Dialog hatte ein Fokusproblem, das nur im echten Browser
 * auftritt: Radix setzt den Fokus auf das erste Bedienelement — hier ein
 * Auswahlfeld, das genau unter dem Zeiger lag, der eben noch auf „Bearbeiten"
 * stand. Statt des Formulars sah man die aufgeklappte Auswahlliste. Geprueft
 * wird deshalb, wo der Fokus landet und dass die Felder aus dem Ziel
 * vorbelegt sind.
 */
test("legt ein Monatsziel an und oeffnet es zum Bearbeiten mit gefuellten Feldern", async ({
  page,
}) => {
  // Der laufende Monat: Nur so steht das Ziel danach im Reiter „Aktiv",
  // unabhaengig davon, wann der Test laeuft.
  const monat = String(new Date().getMonth() + 1);

  await page.goto("/#/ziele");
  await page
    .getByRole("button", { name: /Ziel anlegen/ })
    .first()
    .click();
  await page.getByLabel("Zielart").selectOption("monthly");
  await page.getByLabel("Kalendermonat").selectOption(monat);
  await page.getByLabel("Zielbetrag (€)").fill("500,00");
  await page.getByRole("button", { name: "Ziel anlegen", exact: true }).click();

  await page.goto("/#/ziele");
  await page
    .getByRole("button", { name: /Bearbeiten/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Nicht das Auswahlfeld: Sonst klappt dessen Liste sofort auf.
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).not.toBe(
    "SELECT",
  );

  await expect(page.getByLabel("Zielart")).toHaveValue("monthly");
  await expect(page.getByLabel("Kalendermonat")).toHaveValue(monat);
  await expect(page.getByLabel("Zielbetrag (€)")).toHaveValue("500,00");
});
