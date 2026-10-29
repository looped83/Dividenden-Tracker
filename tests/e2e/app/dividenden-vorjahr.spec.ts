import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Dividendenliste seit 2.53.0: Veränderung zum Vorjahr je Zahlung (Prozent
 * seit 2.53.1 nur im Titel) und in Prozent je Monat, dazu das Reinvestitions-Zeichen hinter dem Namen — wie im
 * Kalender ab dem Zahltag, an dem die Reinvestition eingeschaltet war.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2025-08-12", netAmount: "40.00" },
      { payDate: "2025-09-12", netAmount: "50.00" },
      { payDate: "2026-08-12", netAmount: "30.00" },
      { payDate: "2026-09-12", netAmount: "60.00" },
    ],
  },
});

test("zeigt Vorjahresvergleich in Prozent und Reinvestition", async ({ page, konto }) => {
  await asUser(konto.userId, (client) =>
    client.query("update securities set reinvest_since = '2026-09-01' where id = $1", [
      konto.securityId,
    ]),
  );
  await page.clock.setFixedTime(new Date("2026-10-03T12:00:00"));
  await page.goto("/#/eingaenge");

  // Offen ist der jüngste Monat mit Zahlungen.
  const main = page.getByRole("main");
  await expect(
    main.getByText(/10,00\s€ \(\+20,0\s%\) gegenüber dem Vorjahr/),
  ).toBeAttached();
  await expect(main.getByText(/^\+20,0\s% gegenüber September 2025/)).toBeAttached();
  await expect(main.getByText("Wird reinvestiert")).toHaveCount(1);

  // Mit Assetfilter wiederholte der Monatskopf nur den Vergleich der Zahlung.
  await page.goto(`/#/eingaenge?security=${konto.securityId}`);
  await expect(
    main.getByText(/10,00\s€ \(\+20,0\s%\) gegenüber dem Vorjahr/),
  ).toBeAttached();
  await expect(main.getByText(/gegenüber September 2025/)).toHaveCount(0);

  // Der August lag vor dem Einschalten und ging zurück.
  await page.goto("/#/eingaenge?year=2026&month=8");
  await expect(main.getByText(/−25,0\s% gegenüber August 2025/)).toBeAttached();
  await expect(main.getByText("Wird reinvestiert")).toHaveCount(0);
});
