import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * „Alle Ziele“ (seit 2.41.0): Jahresziele und das neueste Jahr der
 * Monatsziele offen, je Bereich die fünf neuesten Ziele, der Rest hinter
 * „Weitere anzeigen“. Aufgeklapptes bleibt beim Rückweg von einem Ziel.
 */
test("zeigt je Bereich die neuesten Ziele, den Rest auf Wunsch", async ({
  page,
  konto,
}) => {
  await asUser(konto.userId, (client) =>
    client.query(
      `insert into goals (goal_type, year, month, target_amount) values
         ('annual', 2020, null, 900), ('annual', 2021, null, 950),
         ('annual', 2022, null, 1000), ('annual', 2023, null, 1100),
         ('annual', 2024, null, 1200), ('annual', 2025, null, 1300),
         ('annual', 2026, null, 1400), ('monthly', 2025, 12, 100),
         ('monthly', 2026, 1, 100), ('monthly', 2026, 2, 100),
         ('monthly', 2026, 3, 100), ('monthly', 2026, 4, 100),
         ('monthly', 2026, 5, 100), ('monthly', 2026, 6, 100),
         ('monthly', 2026, 7, 100), ('monthly', 2026, 8, 100)`,
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00"));
  await page.goto("/#/ziele");

  const row = (name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) });
  const area = (name: string) =>
    page.getByRole("button", { name: new RegExp(`^${name}`) });
  await expect(area("Jahresziele")).toHaveAttribute("aria-expanded", "true");
  await expect(area("Monatsziele 2026")).toHaveAttribute("aria-expanded", "true");
  await expect(area("Monatsziele 2026")).toContainText("0 von 8 erreicht");
  await expect(area("Monatsziele 2025")).toHaveAttribute("aria-expanded", "false");

  await expect(row("Dividendenziel 2022")).toBeVisible();
  await expect(row("Dividendenziel 2021")).toHaveCount(0);
  await expect(row("Dividendenziel April 2026")).toBeVisible();
  await expect(row("Dividendenziel März 2026")).toHaveCount(0);

  await page.getByRole("button", { name: "2 weitere anzeigen" }).click();
  await page.getByRole("button", { name: "3 weitere anzeigen" }).click();
  await expect(row("Dividendenziel 2020")).toBeVisible();
  await expect(row("Dividendenziel Januar 2026")).toBeVisible();

  await row("Dividendenziel 2021").click();
  await page.getByRole("link", { name: "Zur Zielübersicht" }).click();
  await expect(row("Dividendenziel 2020")).toBeVisible();
  await expect(row("Dividendenziel Januar 2026")).toBeVisible();
  await expect(page.getByRole("button", { name: "Weniger anzeigen" })).toHaveCount(2);
});
