import { expect, test } from "../support/appTest";

/**
 * Bildlaufposition beim Wechsel des Bereichs.
 *
 * Ohne Zutun behaelt eine Einzelseiten-Anwendung ihre Position: Wer weit unten
 * in einer Liste einen Eintrag anklickt, landet auf der Zielseite mitten im
 * Inhalt und sieht deren Ueberschrift gar nicht. Geprueft wird deshalb der
 * Wechsel des Pfades — und der Weg zurueck, der die Position wieder einnehmen
 * soll, statt die Liste von vorn zu beginnen.
 *
 * Nur im Browser messbar: In jsdom hat nichts eine Hoehe, es gibt also auch
 * nichts zu scrollen.
 */
test.use({
  seed: {
    // Genug Zeilen, damit die Liste ueber das Fenster hinausreicht.
    payments: Array.from({ length: 40 }, (_, index) => ({
      payDate: `2026-${String((index % 6) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
      netAmount: "12.00",
    })),
  },
});

test("ein Wechsel des Bereichs beginnt oben, der Weg zurueck an Ort und Stelle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/#/eingaenge");
  await expect(page.getByRole("heading", { name: "Dividenden", level: 1 })).toBeVisible();

  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const unten = await page.evaluate(() => window.scrollY);
  expect(unten).toBeGreaterThan(100);

  await page.getByRole("link", { name: "Bearbeiten" }).last().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Dividenden", level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(unten);
});

test("Blaettern beginnt oben, der Weg zurueck endet auf derselben Seite", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/#/eingaenge");
  await expect(page.getByText(/1–25 von 40/)).toBeVisible();

  // Die Schaltflaeche steht unter der Liste; ohne Zutun saehe man danach das
  // Ende der neuen Seite.
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByText(/26–40 von 40/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const unten = await page.evaluate(() => window.scrollY);
  await page
    .getByRole("link", { name: /Muster AG/ })
    .last()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Frueher lag die Seite im Komponentenzustand: Zurueck landete auf Seite 1,
  // aber an der Bildlaufposition von Seite 2.
  await page.goBack();
  await expect(page.getByText(/26–40 von 40/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(unten);
});
