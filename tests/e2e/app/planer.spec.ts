import { seedPortfolio } from "../support/portfolio";
import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Planer (seit 2.20.0): Nachkauf, Monatsluecken und Schneeball. Annahmen und
 * ausgeschlossene Assets stehen am Profil und ueberdauern ein Neuladen
 * (Migration 0034).
 */

/**
 * Ohne eigene Gewichtung gilt 0 % (seit 2.25.0) — dann schlüge der
 * Nachkauf nichts vor. Hier deshalb je Asset 30 %.
 */
async function seedWeights(userId: string): Promise<void> {
  await asUser(userId, async (client) => {
    await client.query(
      `update profiles set position_caps =
         (select jsonb_object_agg(id, 30) from securities)`,
    );
  });
}
test("verteilt einen Einmalkauf und merkt sich ausgeschlossene Assets", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await seedWeights(konto.userId);
  await page.goto("/#/planer");

  await expect(page.getByText("Dieser Kauf bringt im Jahr")).toBeVisible();
  // Telefon: Liste; ab md seit 2.32.0 eine Tabelle.
  const kaeufe = page.getByRole("region", { name: "Käufe" }).locator("li, tbody tr");
  await expect(kaeufe).toHaveCount(3);

  const ausblenden = kaeufe
    .first()
    .getByRole("button", { name: / nicht mehr vorschlagen$/ });
  const name = ((await ausblenden.getAttribute("aria-label")) ?? "").replace(
    " nicht mehr vorschlagen",
    "",
  );
  expect(name).not.toBe("");
  await ausblenden.click();
  await expect(page.getByText("1 Asset ausgeschlossen")).toBeVisible();

  await page.reload();
  await expect(page.getByText("1 Asset ausgeschlossen")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Käufe" }).getByText(name, { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "1 Asset ausgeschlossen" }).click();
  await page.getByRole("button", { name: `${name} wieder vorschlagen` }).click();
  await expect(page.getByText("1 Asset ausgeschlossen")).toHaveCount(0);
});

test("speichert die Annahmen des Schneeballs", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer/schneeball");

  const savings = page.getByLabel("Einmalkäufe pro Monat, zusätzlich zu den Sparplänen");
  await savings.fill("500");
  await savings.press("Enter");
  await expect(savings).toHaveValue("500");

  await page.reload();
  await expect(
    page.getByLabel("Einmalkäufe pro Monat, zusätzlich zu den Sparplänen"),
  ).toHaveValue("500");
});

test.describe("Reise und Ziel-Zeit (seit 2.32.0)", () => {
  test.use({
    seed: {
      payments: [
        { payDate: "2023-06-15", netAmount: "240.00" },
        { payDate: "2025-06-15", netAmount: "960.00" },
      ],
    },
  });

  test("zeigt den bisherigen Weg und wie viel früher ein Kauf ans Ziel bringt", async ({
    page,
    konto,
  }) => {
    await seedPortfolio(konto.userId);
    await seedWeights(konto.userId);
    await asUser(konto.userId, (client) =>
      client.query(
        `update profiles set forecast_settings = '{"monthlySavings": 500, "targetMonthly": 1000}'`,
      ),
    );

    await page.goto("/#/planer/schneeball");
    // 240 € im ersten Jahr sind 20 € im Monat.
    await expect(page.getByText("2023: 20 €")).toBeVisible();
    // Seit 2.36.0 ohne Legende; „10 J." blendet den Weg aus und zeigt nur
    // die Hochrechnung.
    await expect(page.getByRole("img", { name: /seit 2023/ })).toBeVisible();
    await page.getByRole("radio", { name: "10 J." }).click();
    await expect(
      page.getByRole("img", { name: /^Nettodividende pro Monat, hoch/ }),
    ).toBeVisible();

    await page.goto("/#/planer");
    const gain = page.getByRole("link", { name: /früher am Ziel/ });
    await expect(gain).toBeVisible();
    await gain.click();
    await expect(page).toHaveURL(/#\/planer\/schneeball$/);
  });
});

test("verwirft Annahmen über der Obergrenze, statt still anders zu rechnen", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer/schneeball");

  // 35 % liegt ueber der Grenze von 30 %: Das Feld stellt den vorigen Wert
  // wieder her, statt 35 zu zeigen und mit 2 % zu rechnen.
  const inflation = page.getByLabel("Inflation pro Jahr");
  await expect(inflation).toHaveValue("2");
  await inflation.fill("35");
  await inflation.press("Enter");
  await expect(inflation).toHaveValue("2");

  await page.reload();
  await expect(page.getByLabel("Inflation pro Jahr")).toHaveValue("2");
});

test("pflegt Sparpläne und zeigt sie am Asset", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await seedWeights(konto.userId);
  await page.goto("/#/planer/sparplaene");

  await page.getByRole("button", { name: "Sparplan eintragen" }).click();
  const dialog = page.getByRole("dialog", { name: "Neuer Sparplan" });
  await dialog.getByLabel("Asset").selectOption({ label: "Allianz" });
  await dialog.getByLabel("Rate (€)").fill("30");
  await dialog.getByLabel("Rhythmus").selectOption("weekly");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toHaveCount(0);

  // 30 € wöchentlich sind 130 € im Monat.
  await page.reload();
  const plaene = page.getByRole("region", { name: "Pläne" });
  await expect(plaene.getByText("Allianz", { exact: true })).toBeVisible();
  await expect(page.getByText("Sparpläne im Monat")).toBeVisible();
  await expect(plaene.getByText("≈ 130 €")).toBeVisible();
  // Alle Assets mit 30 % Gewichtung, nur Allianz mit Plan: Tipps nennen die
  // mit dem meisten Platz, Allianz nicht.
  const tipps = page.getByRole("region", { name: "Tipps" });
  await expect(tipps.locator("li, tbody tr")).toHaveCount(3);
  await expect(tipps.getByText("Allianz", { exact: true })).toHaveCount(0);

  await page.goto("/#/depot");
  await page
    .getByRole("link", { name: /Allianz/ })
    .first()
    .click();
  const abschnitt = page.getByRole("region", { name: "Planung" });
  await expect(abschnitt.getByText("30 € wöchentlich")).toBeVisible();

  // Der Schneeball rechnet die Pläne zu den Einmalkäufen hinzu (seit 2.33.0).
  await page.goto("/#/planer/schneeball");
  await expect(page.getByText("Dazu 130 € Sparpläne im Monat")).toBeVisible();
});

test("merkt sich eine eigene Gewichtung am Asset", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot");
  await page
    .getByRole("link", { name: /Allianz/ })
    .first()
    .click();

  const gewichtung = page.getByRole("textbox", { name: "Gewichtung" });
  await expect(gewichtung).toHaveValue("");
  // Auf eine Nachkommastelle genau; gespeichert wird beim Verlassen.
  await gewichtung.fill("1,5");
  await gewichtung.press("Enter");
  await expect(page.getByText("kein Nachkauf")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Gewichtung" })).toHaveValue("1,5");
});
