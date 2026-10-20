import { expect, test } from "../support/appTest";

/**
 * Jahresrückblick: Einstieg über das Banner der Statistik-Übersicht (nur mit
 * gewähltem Jahr), Blättern
 * per Knopf und Pfeiltaste, Schließen per Escape zurück in die Statistik.
 */

test.use({
  seed: {
    payments: [
      { payDate: "2024-03-10", netAmount: "40.00" },
      { payDate: "2025-03-10", netAmount: "55.00" },
      { payDate: "2025-09-10", netAmount: "60.00" },
    ],
  },
});

test("Rückblick öffnet als Story und kehrt zur Statistik zurück", async ({ page }) => {
  // Ohne gewähltes Jahr kein Banner — der Rückblick gehört zu einem Jahr.
  await page.goto("/#/statistiken");
  await expect(page.getByText("Gesamtsumme")).toBeVisible();
  await expect(page.getByRole("link", { name: /Jahresrückblick/ })).toHaveCount(0);

  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();

  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story).toBeVisible();
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  await story.getByRole("button", { name: "Nächste Seite" }).click();
  await expect(story.getByText("Netto erhalten")).toBeVisible();
  await expect(story.getByText("115,00 €")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(story.getByText("Dein Weg seit 2024")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
  await expect(story).toBeHidden();
});

test("Startseite zeigt den Rückblick zum Jahreswechsel und kehrt dorthin zurück", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-05T12:00:00"));
  await page.goto("/#/");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();

  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(story).toBeHidden();
  await expect(page).toHaveURL(/#\/$/);
});

test("Startseite zeigt außerhalb des Jahreswechsels keinen Rückblick", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-11T12:00:00"));
  await page.goto("/#/");
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Jahresrückblick/ })).toHaveCount(0);
});

test("Story blättert von allein weiter und lässt sich anhalten", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/statistiken/rueckblick/2025");
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  await page.clock.runFor(7500);
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  await story.getByRole("button", { name: "Anhalten" }).click();
  await page.clock.runFor(15_000);
  await expect(story.getByText("Netto erhalten")).toBeVisible();
  await expect(
    story.getByRole("button", { name: "Automatisch weiterblättern" }),
  ).toBeVisible();
});

test("Zurück startet die Zeit neu, nach der letzten Karte schließt die Story", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await story.getByRole("button", { name: "Nächste Seite" }).click();
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  // Pause gilt nur der Karte: Zurück lässt die Zeit wieder laufen.
  await story.getByRole("button", { name: "Anhalten" }).click();
  await story.getByRole("button", { name: "Vorherige Seite" }).click();
  await page.clock.runFor(7500);
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  await page.clock.runFor(120_000);
  await expect(story).toBeHidden();
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
});

test("Wisch nach unten schließt die Story", async ({ page }) => {
  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  const box = await story.getByText("Dein Dividendenjahr").boundingBox();
  if (!box) throw new Error("Story nicht sichtbar");
  await page.mouse.move(box.x + 100, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(story).toBeHidden();
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
});
