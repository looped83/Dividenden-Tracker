import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Monatsabschluss: in den ersten sieben Tagen eines Monats steht das Ergebnis
 * des Vormonats über dem Kopf der Übersicht, samt Monatsziel. Ausgeblendet
 * bleibt er für diesen Monat weg.
 */

test.use({
  seed: {
    payments: [
      { payDate: "2025-09-12", netAmount: "40.00" },
      { payDate: "2026-09-12", netAmount: "50.00" },
    ],
  },
});

test("zeigt den Vormonat mit Ziel und lässt sich ausblenden", async ({ page, konto }) => {
  await asUser(konto.userId, (client) =>
    client.query(
      "insert into goals (goal_type, year, month, target_amount) values ('monthly', 2026, 9, 45)",
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-03T12:00:00"));
  await page.goto("/#/");

  const recap = page.getByRole("region", { name: "Monatsabschluss September" });
  await expect(recap).toBeVisible();
  await expect(recap.getByText("50,00 €").first()).toBeVisible();
  await expect(recap.getByText("+25,0 % ggü. Vj.")).toBeVisible();
  await expect(recap.getByText(konto.securityName)).toBeVisible();
  await expect(recap.getByText("Übertroffen")).toBeVisible();

  await recap
    .getByRole("button", { name: "Monatsabschluss September ausblenden" })
    .click();
  await expect(recap).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toBeVisible();
  await expect(recap).toHaveCount(0);
});

test("erscheint nach dem 7. eines Monats nicht mehr", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00"));
  await page.goto("/#/");
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Monatsabschluss/ })).toHaveCount(0);
});
