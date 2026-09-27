import { expect, test } from "../support/appTest";

/**
 * Ein Zahltag ist ein Kalendertag, kein Zeitpunkt.
 *
 * Liste, Detailseite und Dialoge formatierten ihn frueher wie einen
 * Zeitstempel: `new Date("2026-03-10")` ist UTC-Mitternacht und westlich von
 * Greenwich noch der Vortag. In Deutschland faellt das nicht auf — deshalb
 * laeuft dieser Test bewusst in New York.
 */
test.use({
  timezoneId: "America/New_York",
  seed: { payments: [{ payDate: "2026-03-10", netAmount: "50.00" }] },
});

test("zeigt den Zahltag auch westlich von UTC am richtigen Tag", async ({
  page,
  konto,
}) => {
  await page.goto("/#/eingaenge?year=2026");
  await expect(page.getByText("10.03.2026").first()).toBeVisible();
  await expect(page.getByText("09.03.2026")).toHaveCount(0);

  await page.goto(`/#/eingaenge/${konto.paymentIds[0] ?? ""}`);
  await expect(page.getByText("10.03.2026").first()).toBeVisible();
  await expect(page.getByText("09.03.2026")).toHaveCount(0);
});
