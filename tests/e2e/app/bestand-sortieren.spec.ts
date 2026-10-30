import { seedPortfolio } from "../support/portfolio";
import { asSuperuser, asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Bestand › Assets (seit 2.35.0): Spaltenkoepfe sortieren die Tabelle, erneutes
 * Antippen dreht die Richtung. Kopf und Auswahl der Filterleiste schreiben
 * dieselben Adressparameter und zeigen deshalb immer dieselbe Sortierung.
 */
test("sortiert die Assettabelle per Spaltenkopf", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await asUser(konto.userId, async (client) => {
    await client.query(
      `update profiles set position_caps = (
         select jsonb_object_agg(id, case name when 'Allianz' then 8 else 3 end)
           from securities where name in ('Allianz', 'BASF'))`,
    );
  });
  // Die Tabelle steht ab md; darunter traegt eine Liste die Assets.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/depot");

  const tabelle = page.getByRole("table");
  const ersteZeile = tabelle.locator("tbody tr").first();
  const wert = page.getByRole("columnheader", { name: "Nach Wert sortieren" });
  await expect(
    page.getByRole("columnheader", { name: "Nach Asset sortieren" }),
  ).toHaveAttribute("aria-sort", "ascending");

  // Zahlen beginnen mit dem groessten Wert …
  await wert.getByRole("button").click();
  await expect(wert).toHaveAttribute("aria-sort", "descending");
  await expect(ersteZeile).toContainText("iShares MSCI World");
  await expect(page.getByLabel("Sortierung")).toHaveValue("value");

  // … erneutes Antippen dreht die Richtung.
  await wert.getByRole("button").click();
  await expect(wert).toHaveAttribute("aria-sort", "ascending");
  await expect(ersteZeile).toContainText("Toyota");

  // Zielgewichtung steht neben der Gewichtung; ohne eigene stehen Assets am Ende.
  await page.getByRole("button", { name: "Nach Zielgewichtung sortieren" }).click();
  await expect(ersteZeile).toContainText("Allianz");
  await expect(ersteZeile).toContainText("8,0 %");
  await expect(tabelle.locator("tbody tr").nth(1)).toContainText("BASF");

  // Die Auswahl der Filterleiste setzt den Kopf mit.
  await page.getByLabel("Sortierung").selectOption("gain");
  await expect(
    page.getByRole("columnheader", { name: "Nach Gewinn sortieren" }),
  ).toHaveAttribute("aria-sort", "descending");
});

test("öffnet das Asset per Klick irgendwo in der Tabellenzeile", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/depot");
  // Seit 2.48.0 traegt die Zeile keine Aktionen mehr; sie fuehrt zur
  // Detailseite. Geklickt wird auf den Wert, nicht auf den Namen.
  await page
    .getByRole("row", { name: /Allianz/ })
    .getByRole("cell")
    .nth(1)
    .click();
  await expect(page).toHaveURL(/#\/depot\/[0-9a-f-]+$/);
});

test("zeigt auf dem Telefon Gewichtung und Zielgewichtung je Asset", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await asUser(konto.userId, async (client) => {
    await client.query(
      `update profiles set position_caps = (
         select jsonb_object_agg(id, case name when 'Allianz' then 0 else 1 end)
           from securities where name in ('Allianz', 'BASF'))`,
    );
  });
  // Den Anteil am Depot liefert der Export (DivvyDiary), nicht die App;
  // Snapshots schreibt nur der Import.
  await asSuperuser(async (client) => {
    await client.query("begin");
    // Die Snapshot-Trigger lesen den Nutzer aus den Claims.
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: konto.userId, role: "authenticated" }),
    ]);
    await client.query(
      `update security_snapshots
          set allocation = market_value /
            (select sum(market_value) from security_snapshots where user_id = $1)
        where user_id = $1`,
      [konto.userId],
    );
    await client.query("commit");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/depot");

  const zeile = (name: string) => page.getByRole("link", { name: new RegExp(name) });
  // Eine eingetragene 0 ist ein Ziel, kein fehlendes.
  await expect(zeile("Allianz")).toContainText(/Gewichtung [\d,]+\s%\s·\sZiel 0,0\s%/);
  await expect(zeile("BASF")).toContainText(/Ziel 1,0\s%/);
  await expect(zeile("Toyota")).toContainText("ohne Ziel");
});
