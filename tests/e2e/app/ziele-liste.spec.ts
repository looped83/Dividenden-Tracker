import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * „Alle Ziele“ (seit 2.38.0): Jahresziele aufgeklappt, Jahre vor dem Vorjahr
 * unter „Ältere Ziele“, Monatsziele je Jahr eingeklappt. Aufgeklapptes bleibt
 * beim Zurückgehen von einem Ziel offen.
 */
test("klappt Monatsziele und ältere Jahre ein", async ({ page, konto }) => {
  await asUser(konto.userId, (client) =>
    client.query(
      `insert into goals (goal_type, year, month, target_amount) values
         ('annual', 2022, null, 1000), ('annual', 2023, null, 1100),
         ('annual', 2024, null, 1200), ('annual', 2025, null, 1300),
         ('annual', 2026, null, 1400), ('monthly', 2026, 1, 100),
         ('monthly', 2026, 2, 100), ('monthly', 2026, 3, 100)`,
    ),
  );
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00"));
  await page.goto("/#/ziele");

  await expect(page.getByRole("button", { name: /^Jahresziele/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const row = (name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) });
  await expect(row("Dividendenziel 2026")).toBeVisible();
  await expect(row("Dividendenziel 2025")).toBeVisible();
  await expect(row("Dividendenziel 2023")).toHaveCount(0);
  await expect(row("Dividendenziel März 2026")).toHaveCount(0);

  const months = page.getByRole("button", { name: /^Monatsziele 2026/ });
  await expect(months).toHaveAttribute("aria-expanded", "false");
  await expect(months).toContainText("0 von 3 erreicht");
  await months.click();
  await expect(row("Dividendenziel März 2026")).toBeVisible();

  const older = page.getByRole("button", { name: /^Ältere Ziele/ });
  await expect(older).toContainText("2022–2024");
  await older.click();
  await expect(row("Dividendenziel 2023")).toBeVisible();

  await row("Dividendenziel 2023").click();
  await expect(page).toHaveURL(/#\/ziele\/[^?]+$/);
  await page.getByRole("link", { name: "Zur Zielübersicht" }).click();
  await expect(row("Dividendenziel März 2026")).toBeVisible();
  await expect(row("Dividendenziel 2023")).toBeVisible();
});
