import { seedPortfolio } from "../support/portfolio";
import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Reinvestition (seit 2.38.0): Der Schalter auf der Seite des Assets speichert
 * sofort; die Bestandsliste kennzeichnet das Asset danach — auch nach dem
 * Neuladen, also aus der Datenbank.
 */
test("schaltet die Reinvestition am Asset und zeigt sie im Bestand", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot");
  await expect(page.getByText("Dividenden werden reinvestiert")).toHaveCount(0);

  await page.getByRole("link", { name: "Microsoft" }).first().click();
  const schalter = page.getByRole("switch", { name: "Dividenden reinvestieren" });
  await expect(schalter).toHaveAttribute("aria-checked", "false");
  await schalter.click();
  await expect(schalter).toHaveAttribute("aria-checked", "true");

  await page.goto("/#/depot");
  await page.reload();
  await expect(page.getByText("Dividenden werden reinvestiert")).toHaveCount(1);
});

test.describe("Monatsabschluss und Rückblick", () => {
  test.use({
    seed: {
      payments: [
        { payDate: "2025-08-12", netAmount: "20.00" },
        { payDate: "2025-09-12", netAmount: "30.00" },
        { payDate: "2026-09-12", netAmount: "50.00" },
      ],
    },
  });

  test("nennen, was ab dem Einschalten reinvestiert wurde", async ({ page, konto }) => {
    await asUser(konto.userId, (client) =>
      client.query("update securities set reinvest_since = '2025-09-01' where id = $1", [
        konto.securityId,
      ]),
    );
    await page.clock.setFixedTime(new Date("2026-10-03T12:00:00"));
    await page.goto("/#/");
    const recap = page.getByRole("region", { name: "Monatsabschluss September" });
    await expect(
      recap.getByText(/Davon\s+50,00\s+€\s+automatisch reinvestiert/),
    ).toBeVisible();

    // 2025: nur die Septemberzahlung lag nach dem Einschalten.
    await page.goto("/#/statistiken?year=2025");
    await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();
    const story = page.getByRole("dialog", { name: "Rückblick 2025" });
    await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();
    await expect(async () => {
      await page.keyboard.press("ArrowRight");
      await expect(story.getByText("Der Schneeball rollt")).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(story.getByText("30,00 €")).toBeVisible();
    await expect(
      story.getByText(/60,0\s+% deiner Dividenden im Jahr 2025/),
    ).toBeVisible();
  });
});
