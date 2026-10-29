import { expect, test } from "../support/appTest";

/**
 * Verlauf der Dividenden-Detailseite (seit 2.48.1 „Je Jahr" vorn). Monatsnamen
 * wiederholen sich ueber die Jahre; der Tooltip zeigte bis 2.48.2 beim Balken
 * Februar 2026 die Werte von Februar 2024.
 */
const payments: { payDate: string; netAmount: string }[] = [];
for (const [index, payDate] of [2024, 2025, 2026]
  .flatMap((year) =>
    ["02", "04", "07", "10"].map((month) => `${String(year)}-${month}-05`),
  )
  .entries()) {
  payments.push({ payDate, netAmount: (0.62 + index * 2.5).toFixed(2) });
}

test.use({ seed: { payments, payoutMonths: [2, 4, 7, 10] } });

test("startet je Jahr, Tooltip passt zum Balken", async ({ page, konto }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00"));
  await page.goto(`/#/eingaenge/${konto.paymentIds.at(-1) ?? ""}`);
  await expect(page.getByRole("radio", { name: "Je Jahr" })).toBeChecked();

  await page.getByRole("radio", { name: "Je Zahlung" }).click();
  const bars = page.locator(".recharts-bar-rectangle");
  await expect(bars).toHaveCount(12);
  // Neunter Balken: Februar 2026, nicht Februar 2024.
  await bars.nth(8).hover();
  const tooltip = page.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toContainText("05.02.2026");
  await expect(tooltip).toContainText("20,62");
});
