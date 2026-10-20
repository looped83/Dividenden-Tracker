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
  await expect(story.getByText("Passives Einkommen")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
  await expect(story).toBeHidden();
});
