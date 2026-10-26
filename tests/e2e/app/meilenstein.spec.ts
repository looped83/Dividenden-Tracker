import { expect, test } from "../support/appTest";

/**
 * Neuer Meilenstein auf der Übersicht (seit 2.34.0): Was in den letzten 30
 * Tagen erreicht wurde, führt in den Fortschritt und lässt sich ausblenden.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2026-03-13", netAmount: "830.00" },
      { payDate: "2026-10-09", netAmount: "260.00" },
    ],
  },
});

test("zeigt einen neuen Meilenstein und blendet ihn aus", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00"));
  await page.goto("/#/");

  const card = page.getByRole("region", { name: "Neuer Meilenstein" });
  // Am 9.10. fielen 1.000 € insgesamt und 1.000 € im Jahr: einer steht da,
  // der andere als „weiterer".
  await expect(card).toContainText("Erstmals 1.000 € in einem Jahr");
  await expect(card).toContainText("1 weiterer");

  await card.getByRole("button", { name: /ausblenden/ }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toBeVisible();
  await expect(card).toHaveCount(0);
});
