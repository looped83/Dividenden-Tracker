import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Jahresrückblick: Einstieg über das Banner der Statistik-Übersicht (nur mit
 * gewähltem Jahr), Blättern
 * per Knopf und Pfeiltaste, Schließen per Escape zurück in die Statistik.
 */

test.use({
  seed: {
    payments: [
      { payDate: "2024-03-10", netAmount: "40.00" },
      { payDate: "2025-03-10", netAmount: "55.00" },
      { payDate: "2025-09-10", netAmount: "60.00" },
    ],
  },
});

test("Rückblick öffnet als Story und kehrt zur Statistik zurück", async ({ page }) => {
  // Ohne gewähltes Jahr kein Banner — der Rückblick gehört zu einem Jahr.
  await page.goto("/#/statistiken");
  await expect(page.getByText("Gesamtsumme")).toBeVisible();
  await expect(page.getByRole("link", { name: /Jahresrückblick/ })).toHaveCount(0);

  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();

  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story).toBeVisible();
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(story.getByText("Netto erhalten")).toBeVisible();
  await expect(story.getByText("115,00 €")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(story.getByText("Dein Weg seit 2024")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
  await expect(story).toBeHidden();
});

test("Startseite zeigt den Rückblick zum Jahreswechsel und kehrt dorthin zurück", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-05T12:00:00"));
  await page.goto("/#/");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();

  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();
  // Sichtbar heißt nicht, dass der Tastatur-Listener schon hängt (er kommt im
  // Effekt nach dem Malen) — in WebKit ging ein sofortiges Escape so
  // gelegentlich verloren. Bis zum Schließen wiederholen; ein zweites Escape
  // auf der Startseite bewirkt nichts.
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(story).toBeHidden({ timeout: 1000 });
  }).toPass();
  await expect(page).toHaveURL(/#\/$/);
});

test("Startseite zeigt außerhalb des Jahreswechsels keinen Rückblick", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-11T12:00:00"));
  await page.goto("/#/");
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Jahresrückblick/ })).toHaveCount(0);
});

test("Story blättert von allein weiter und lässt sich anhalten", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/statistiken/rueckblick/2025");
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  await page.clock.runFor(7500);
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  await story.getByRole("button", { name: "Anhalten" }).click();
  await page.clock.runFor(15_000);
  await expect(story.getByText("Netto erhalten")).toBeVisible();
  await expect(
    story.getByRole("button", { name: "Automatisch weiterblättern" }),
  ).toBeVisible();
});

test("Zurück startet die Zeit neu, nach der letzten Karte schließt die Story", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  // Pause gilt nur der Karte: Zurück lässt die Zeit wieder laufen.
  await story.getByRole("button", { name: "Anhalten" }).click();
  await page.keyboard.press("ArrowLeft");
  await page.clock.runFor(7500);
  await expect(story.getByText("Netto erhalten")).toBeVisible();

  // Bis zur letzten Karte blättern und nur deren Standzeit (höchstens 9 s)
  // ablaufen lassen. Die Uhr über alle Karten laufen zu lassen hieße Tausende
  // Animationsbilder — in WebKit länger als das Zeitlimit des Tests.
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  await expect(story.getByText(/in Zahlen/)).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(story).toBeHidden();
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
});

test("Wisch nach unten schließt die Story", async ({ page }) => {
  await page.goto("/#/statistiken?year=2025");
  await page.getByRole("link", { name: "Jahresrückblick 2025 ansehen" }).click();
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  const box = await story.getByText("Dein Dividendenjahr").boundingBox();
  if (!box) throw new Error("Story nicht sichtbar");
  await page.mouse.move(box.x + 100, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(story).toBeHidden();
  await expect(page).toHaveURL(/#\/statistiken\?year=2025$/);
});

test("erzählt Jahresziel, Fixkosten und Meilensteine des Jahres", async ({
  page,
  konto,
}) => {
  await asUser(konto.userId, async (client) => {
    await client.query(
      `insert into goals (goal_type, year, month, target_amount) values
         ('annual', 2025, null, 100), ('monthly', 2025, 3, 50), ('monthly', 2025, 9, 80)`,
    );
    await client.query(`update profiles set fixed_costs = $1::jsonb where id = $2`, [
      JSON.stringify([
        { id: "a1", name: "Streaming", amount: "5.00" },
        { id: "b2", name: "Strom", amount: "60.00" },
      ]),
      konto.userId,
    ]);
  });
  // Im Januar gilt der Rückblick 2025 noch als Vorjahr: Fixkosten sind dabei.
  await page.clock.setFixedTime(new Date("2026-01-05T12:00:00"));
  await page.goto("/#/statistiken/rueckblick/2025");
  const story = page.getByRole("dialog", { name: "Rückblick 2025" });
  await expect(story.getByText("Dein Dividendenjahr")).toBeVisible();

  const forward = async (steps: number, heading: string) => {
    for (let k = 0; k < steps; k++) await page.keyboard.press("ArrowRight");
    await expect(story.getByText(heading, { exact: true })).toBeVisible();
  };

  await forward(3, "Dein Jahresziel 2025");
  await expect(story.getByText("115,0 %")).toBeVisible();
  await expect(story.getByText("1 von 2 erreicht")).toBeVisible();

  await forward(3, "Was Dividenden decken");
  await expect(story.getByText("1 von 2", { exact: true })).toBeVisible();
  await expect(story.getByText("Als Nächstes")).toBeVisible();

  // 2025 fiel keine Stufe: Die Karte zeigt die Summe seit Beginn wie bisher.
  await forward(4, "Seit 2024");
  await forward(1, "Dein nächster Meilenstein");
  await expect(story.getByText("1.000 €")).toBeVisible();
  await expect(story.getByText("Steuern und Abzüge")).toHaveCount(0);
});
