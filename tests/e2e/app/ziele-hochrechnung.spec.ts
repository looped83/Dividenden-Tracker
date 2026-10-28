import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Hochrechnung je Ziel (CALCULATION_RULES.md §13.1): erhalten plus der Rest
 * der Jahresprognose (§9.7). Am 23.10.2026: 1.420 € erhalten, angekündigt
 * 320 € am 14.11., aus dem Vorjahr kommen noch 400 € im Dezember — erwartet
 * 2.140 €.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2025-03-14", netAmount: "750.00" },
      { payDate: "2025-06-13", netAmount: "550.00" },
      { payDate: "2025-11-14", netAmount: "300.00" },
      { payDate: "2025-12-12", netAmount: "400.00" },
      { payDate: "2026-03-13", netAmount: "830.00" },
      { payDate: "2026-09-11", netAmount: "430.00" },
      { payDate: "2026-10-09", netAmount: "160.00" },
    ],
    calendarEvents: [
      { date: "2026-11-14", title: "Muster AG", amount: "320.00", company: "Muster AG" },
    ],
  },
});

test("zeigt den Kurs je offenem Ziel und die Hochrechnung", async ({ page, konto }) => {
  await asUser(konto.userId, (client) =>
    client.query(
      `insert into goals (goal_type, year, month, target_amount) values
         ('annual', 2026, null, 2200), ('annual', 2027, null, 2400),
         ('monthly', 2026, 10, 200), ('monthly', 2026, 11, 300),
         ('monthly', 2026, 12, 420)`,
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00"));
  await page.goto("/#/ziele");

  await expect(page.getByText("Hochrechnung 2.140 € von 2.200 € · Knapp")).toBeVisible();
  const row = (name: string) => page.getByRole("link", { name: new RegExp(name) });
  // Die Monatsziele stehen eingeklappt hinter einer Zeile (seit 2.38.0).
  await page.getByRole("button", { name: /^Monatsziele 2026/ }).click();
  await expect(row("Dividendenziel 2026")).toContainText("Knapp");
  await expect(row("Dividendenziel Oktober 2026")).toContainText("Unter Plan");
  await expect(row("Dividendenziel November 2026")).toContainText("Im Plan");
  await expect(row("Dividendenziel Dezember 2026")).toContainText("Knapp");
  // Über das Jahr hinaus kennt die Prognose nichts.
  await expect(row("Dividendenziel 2027")).toContainText("Bevorstehend");

  await row("Dividendenziel 2026").click();
  await expect(page.getByText("Hochrechnung", { exact: true })).toBeVisible();
  await expect(page.getByText("2.140,00 €")).toBeVisible();
});
