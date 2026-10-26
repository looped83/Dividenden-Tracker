import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";
import { seedPortfolio } from "../support/portfolio";

/**
 * Monatsziele aus dem Jahresziel (§13.2) und die Ziellücke als Nachkauf
 * (§13.3). Am 23.10.2026: 1.420 € erhalten, aus dem Vorjahr kommen noch
 * 300 € im November und 400 € im Dezember — Hochrechnung 2.120 € gegen ein
 * Jahresziel von 2.400 €.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2025-03-14", netAmount: "750.00" },
      { payDate: "2025-11-14", netAmount: "300.00" },
      { payDate: "2025-12-12", netAmount: "400.00" },
      { payDate: "2026-03-13", netAmount: "830.00" },
      { payDate: "2026-09-11", netAmount: "430.00" },
      { payDate: "2026-10-09", netAmount: "160.00" },
    ],
  },
});

test("leitet Monatsziele ab und zeigt die Lücke", async ({ page, konto }) => {
  await asUser(konto.userId, (client) =>
    client.query(
      "insert into goals (goal_type, year, month, target_amount) values ('annual', 2026, null, 2400)",
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00"));
  await page.goto("/#/ziele");

  await expect(page.getByText("Hochrechnung 2026")).toBeVisible();
  await expect(page.getByText("Es fehlen ≈ 280 €")).toBeVisible();

  // Fehlen 2.400 − 1.260 (bis September) = 1.140 €, verteilt 160 : 300 : 400.
  await page.getByRole("button", { name: "Monatsziele" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Oktober")).toBeVisible();
  await expect(dialog.getByText("1.140 €")).toBeVisible();
  await dialog.getByRole("button", { name: "3 Monatsziele anlegen" }).click();
  await expect(dialog).toBeHidden();

  const row = (name: string) => page.getByRole("link", { name: new RegExp(name) });
  await expect(row("Dividendenziel Oktober 2026")).toContainText("212,00 €");
  await expect(row("Dividendenziel November 2026")).toContainText("398,00 €");
  await expect(row("Dividendenziel Dezember 2026")).toContainText("530,00 €");
  // Alle Monate haben ein Ziel: nichts mehr abzuleiten.
  await expect(page.getByRole("button", { name: "Monatsziele" })).toHaveCount(0);
});

test("schlägt mit Depotstand einen Zukauf vor", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await asUser(konto.userId, (client) =>
    client.query(
      "insert into goals (goal_type, year, month, target_amount) values ('annual', 2026, null, 2400)",
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00"));
  await page.goto("/#/ziele");

  await expect(page.getByText(/schließen die Lücke bis Dezember/)).toBeVisible();
  await page.getByRole("link", { name: "Nachkauf planen" }).click();
  await expect(page).toHaveURL(/#\/planer\?betrag=\d+/);
});
