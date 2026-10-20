import { expect, test } from "../support/appTest";

/**
 * Jahresrückblick: Einstieg über die Karte der Statistik-Übersicht, Blättern
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
  await page.goto("/#/statistiken");

  const teaser = page.getByRole("region", { name: "Jahresrückblick" });
  await expect(teaser).toBeVisible();
  await teaser.getByRole("link", { name: /Dein Dividendenjahr 2025/ }).click();

  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story).toBeVisible();
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  await story.getByRole("button", { name: "Nächste Seite" }).click();
  await expect(story.getByText("Netto erhalten")).toBeVisible();
  await expect(story.getByText("115,00 €")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(story.getByText("Passives Einkommen")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/statistiken$/);
  await expect(story).toBeHidden();
});
