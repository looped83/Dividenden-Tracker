import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Ticker, ISIN und WKN legt ein Klick in die Zwischenablage. Im CI laeuft das
 * iPhone-Projekt mit Safaris Motor: Dort scheitert `writeText`, sobald der
 * Aufruf die Nutzergeste verliert — dann kaeme der Fehler-Toast statt der
 * Bestaetigung.
 */
test("kopiert die Kennungen eines Assets per Klick", async ({
  page,
  konto,
  browserName,
}) => {
  await asUser(konto.userId, async (client) => {
    await client.query(
      "update securities set ticker = 'AAPL', isin = 'US0378331005', wkn = '865985' where id = $1",
      [konto.securityId],
    );
  });
  // Lesen der Zwischenablage erlaubt nur Chromium; WebKit kennt die
  // Berechtigung nicht, dort genuegt die Bestaetigung.
  if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  }

  await page.goto(`/#/depot/${konto.securityId}`);
  const stammdaten = page.getByRole("region", { name: "Stammdaten" });

  for (const [label, value] of [
    ["Ticker", "AAPL"],
    ["ISIN", "US0378331005"],
    ["WKN", "865985"],
  ] as const) {
    await stammdaten.getByRole("button", { name: `${label} ${value} kopieren` }).click();
    await expect(page.getByText(`${label} kopiert`)).toBeVisible();
    if (browserName === "chromium") {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
    }
  }

  // Auch die Kennungen unter dem Namen im Kopf der Seite.
  await page.getByRole("button", { name: "ISIN US0378331005 kopieren" }).first().click();
  await expect(page.getByText("ISIN kopiert").first()).toBeVisible();
});
