import { expect, test } from "../support/appTest";

/**
 * Anmelden und Abmelden über die Oberfläche.
 *
 * Die übrigen Tests starten mit hinterlegter Sitzung; dieser hier geht den
 * Weg, den ein Nutzer wirklich nimmt — inklusive der abgewiesenen Anmeldung.
 * Die Testbrücke prüft dabei nur, ob das Konto existiert: Passwörter liegen in
 * der emulierten `auth.users`-Tabelle nicht.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("meldet an und wieder ab", async ({ page, konto }) => {
  await page.goto("/#/login");
  await page.getByLabel("E-Mail-Adresse").fill(konto.email);
  await page.getByLabel("Passwort", { exact: true }).fill("passwort-egal");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();

  await page.goto("/#/einstellungen");
  await expect(page.getByText(`Angemeldet als ${konto.email}`)).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();

  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();

  // Nach dem Abmelden führt ein geschützter Bereich wieder zur Anmeldung.
  await page.goto("/#/eingaenge");
  await expect(page).toHaveURL(/#\/login/);
});

test("weist eine unbekannte Anmeldung ab", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("E-Mail-Adresse").fill("niemand@example.test");
  await page.getByLabel("Passwort", { exact: true }).fill("passwort-egal");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "E-Mail-Adresse oder Passwort ist ungültig.",
  );
  await expect(page).toHaveURL(/#\/login/);
});
