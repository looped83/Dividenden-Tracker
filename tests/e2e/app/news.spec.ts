import { expect, test } from "../support/appTest";
import { pruefeAxe } from "../support/axe";

/**
 * Bereich News: gespeicherte Meldungen nach Tagen, Filter nach Thema und
 * Zeitraum, Links zur Quelle in einem neuen Tab. Die Meldungen legt der
 * Superuser an — im Betrieb schreibt sie allein die Edge Function.
 */
test.use({
  seed: {
    news: [
      {
        title: "Muster AG erhöht die Dividende",
        hoursAgo: 1,
        snippet: "Plus 5 Prozent.",
      },
      { title: "Muster AG eröffnet neues Werk", hoursAgo: 30, source: "Börse Muster" },
      { title: "Muster AG: Rückblick auf das Quartal", hoursAgo: 24 * 12 },
    ],
  },
});

test("zeigt Meldungen zum Bestand und filtert nach Thema und Zeitraum", async ({
  page,
}) => {
  await page.goto("/#/news");
  await expect(page.getByRole("heading", { level: 1, name: "News" })).toBeVisible();

  const dividende = page.getByRole("link", { name: /Muster AG erhöht die Dividende/ });
  await expect(dividende).toBeVisible();
  await expect(dividende).toHaveAttribute("target", "_blank");
  await expect(dividende).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("link", { name: /neues Werk/ })).toBeVisible();
  // Älter als die voreingestellten 7 Tage.
  await expect(page.getByRole("link", { name: /Rückblick/ })).toHaveCount(0);

  // Auf dem Telefon klappt der Schalter die Felder erst auf.
  const toggle = page.getByRole("button", { name: /^Filter/ });
  if (await toggle.isVisible()) await toggle.click();

  await page.getByLabel("Thema").selectOption("dividend");
  await expect(page.getByRole("link", { name: /neues Werk/ })).toHaveCount(0);
  await expect(dividende).toBeVisible();

  await page.getByLabel("Thema").selectOption("all");
  await page.getByLabel("Zeitraum").selectOption("30");
  await expect(page.getByRole("link", { name: /Rückblick/ })).toBeVisible();

  await pruefeAxe(page, "News");
});
