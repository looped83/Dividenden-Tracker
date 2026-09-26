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

test("weitere laden haengt an, der Weg zurueck endet an derselben Stelle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/#/eingaenge");
  await expect(page.getByText("25 von 40 angezeigt")).toBeVisible();

  // Angehaengt statt umgeblaettert: Die Position bleibt, wo sie war — man
  // liest einfach weiter.
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const vorher = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "15 weitere laden" }).click();
  await expect(page.getByRole("button", { name: /weitere laden/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(vorher);

  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const unten = await page.evaluate(() => window.scrollY);
  await page
    .getByRole("link", { name: /Muster AG/ })
    .last()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Die geladene Menge steht in der Adresse: Zurueck zeigt wieder alle 40
  // Eingaenge an derselben Stelle, nicht die ersten 25.
  await page.goBack();
  await expect(page.getByRole("button", { name: /weitere laden/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(unten);
});

test("auf dem Telefon fuehrt die Zeile zur Detailseite und diese samt Liste zurueck", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/eingaenge?page=2");
  // Zwei „Seiten" geladen: alle 40 Eingaenge, nichts mehr nachzuladen.
  await expect(page.getByRole("link", { name: /Muster AG/ })).toHaveCount(40);
  await expect(page.getByRole("button", { name: /weitere laden/ })).toHaveCount(0);

  // Eine Tippflaeche je Zeile, keine Aktionen darauf.
  await expect(page.getByRole("button", { name: /stornieren/i })).toHaveCount(0);
  await page
    .getByRole("link", { name: /Muster AG/ })
    .first()
    .click();

  // Die Aktionen stehen auf der Detailseite …
  await expect(
    page.getByRole("button", { name: "Stornieren", exact: true }),
  ).toBeVisible();
  // … und ihr Rueckweg kennt Filter und geladene Menge der Liste.
  await page.getByRole("link", { name: "Zu den Dividenden" }).click();
  await expect(page.getByRole("link", { name: /Muster AG/ })).toHaveCount(40);
});
