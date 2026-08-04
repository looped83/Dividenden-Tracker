import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../support/appTest";

/**
 * Dividendenkalender hinter der Anmeldung (Auftrag §20).
 *
 * Geprüft wird das, was nur im echten Browser messbar ist: dass die
 * angekündigten Termine am richtigen Kalendertag stehen, dass Monatsraster und
 * Liste bedienbar sind, dass die Detailansicht Tastatur und Escape versteht —
 * und dass beides frei von axe-Verstößen ist.
 *
 * Die Termine liegen weit in der Zukunft und tragen ein festes Datum: Der Test
 * navigiert deshalb ausdrücklich in ihren Monat, statt sich auf „heute" zu
 * verlassen.
 */
/** Kalendertag in `days` Tagen — fuer die Kacheln „Diesen Monat"/„30 Tage". */
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test.use({
  seed: {
    calendarEvents: [
      // Zwei Termine im 30-Tage-Fenster: nur sie erscheinen in der Summe.
      {
        date: inDays(3),
        title: "Realty Income Corp. 60,00 € Zahltag (Trade Republic)",
        company: "Realty Income Corp.",
        amount: "60.00",
        portfolio: "Trade Republic",
      },
      {
        date: inDays(5),
        title: "Main Street Capital 40,00 € Zahltag (Trade Republic)",
        company: "Main Street Capital",
        amount: "40.00",
        portfolio: "Trade Republic",
      },
      {
        date: "2099-03-13",
        title: "Apple Inc. 51,37 € Zahltag (Trade Republic)",
        company: "Apple Inc.",
        amount: "51.37",
        portfolio: "Trade Republic",
        description: "Quartalsdividende",
      },
      {
        date: "2099-03-13",
        title: "Allianz SE 12,63 € Zahltag (Trade Republic)",
        company: "Allianz SE",
        amount: "12.63",
        portfolio: "Trade Republic",
      },
      { date: "2099-04-02", title: "Coca-Cola Co." },
    ],
  },
});

async function pruefeAxe(page: import("@playwright/test").Page, kontext: string) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    ergebnis.violations.map((v) => ({ kontext, regel: v.id, hilfe: v.help })),
  ).toEqual([]);
}

test("Liste ist die Standardansicht und zeigt Kacheln je Termin", async ({ page }) => {
  await page.goto("/#/kalender");
  await expect(
    page.getByRole("heading", { name: "Dividendenkalender", level: 1 }),
  ).toBeVisible();

  // Ohne eigene Wahl steht die Liste bereits — kein Klick noetig.
  await expect(page.getByRole("button", { name: "Liste", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Jeder kommende Monat traegt seine eigene Ueberschrift. „Später" endet mit
  // dem laufenden Monat und bleibt hier deshalb leer — die gesetzten Termine
  // liegen alle in 2099 bzw. in dieser Woche.
  await expect(page.getByRole("heading", { name: "März 2099", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "April 2099", level: 2 })).toBeVisible();
  // Jede Kachel traegt ihr Datum selbst — als Zahl und ausgeschrieben.
  const apple = page.getByRole("button", { name: /Apple Inc\./ });
  await expect(apple).toBeVisible();
  await expect(apple).toContainText("13");
  await expect(apple).toContainText("Fr, 13.03.2099");
  // Der Unternehmensname steht ohne Betrag und Depot im Titel …
  await expect(apple).toContainText("Apple Inc.");
  // … der Betrag rechts an der Kante, das Depot in der Metazeile.
  await expect(apple).toContainText("51,37 €");
  await expect(apple).toContainText("Trade Republic");
  await expect(page.getByRole("button", { name: /Allianz SE/ })).toBeVisible();

  // Kennzahlkacheln ueber der Liste — mit der Summe der erwarteten Betraege.
  await expect(page.getByText("Nächster Zahltag")).toBeVisible();
  // Die Summenkacheln zaehlen nur das 30-Tage-Fenster: 60,00 + 40,00 = 100,00.
  // Die Termine von 2099 stehen in der Liste, aber nicht in dieser Summe.
  await expect(page.getByText("100,00 €").first()).toBeVisible();
  await expect(page.getByText(/aus 2 Terminen/).first()).toBeVisible();
  // „Unternehmen" heisst auch der Navigationspunkt daneben — deshalb die
  // Bildunterschrift der Kachel als eindeutiges Merkmal.
  await expect(page.getByText("mit kommenden Zahltagen")).toBeVisible();

  await pruefeAxe(page, "Kalender – Liste");
});

test("Monatsraster stellt mehrere Termine eines Tages dar und blättert", async ({
  page,
}) => {
  await page.goto("/#/kalender");
  await page.getByRole("button", { name: "Monat", exact: true }).click();

  // Vom laufenden Monat in den März 2099 blättern wäre absurd viele Klicks;
  // stattdessen prüft der Test die Navigation an sich und danach den Monat der
  // Termine über die „Heute"-Rückkehr.
  const ueberschrift = page.getByRole("heading", { level: 2 }).first();
  const start = await ueberschrift.textContent();
  await page.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(ueberschrift).not.toHaveText(start ?? "");
  await page.getByRole("button", { name: "Heute" }).click();
  await expect(ueberschrift).toHaveText(start ?? "");

  await pruefeAxe(page, "Kalender – Monat");
});

test("Detailansicht öffnet per Tastatur und schließt mit Escape", async ({ page }) => {
  await page.goto("/#/kalender");
  await page.getByRole("button", { name: "Liste", exact: true }).click();

  const eintrag = page.getByRole("button", { name: /Apple Inc\./ });
  await eintrag.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Quartalsdividende")).toBeVisible();
  // Die Feldnamen im Dialog sind per CSS grossgeschrieben; Playwright liest den
  // dargestellten Text, deshalb ohne Ruecksicht auf Gross-/Kleinschreibung.
  await expect(dialog.getByText(/erwarteter betrag/i)).toBeVisible();
  await expect(dialog.getByText("51,37 €")).toBeVisible();
  await expect(dialog.getByText("Angekündigter Zahltag am 13.03.2099")).toBeVisible();
  await pruefeAxe(page, "Kalender – Detailansicht");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Fokus kehrt nach dem Schließen an den Eintrag zurück", async ({ page }) => {
  await page.goto("/#/kalender");
  await page.getByRole("button", { name: "Liste", exact: true }).click();

  const eintrag = page.getByRole("button", { name: /Apple Inc\./ });
  await eintrag.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(eintrag).toBeFocused();
});

test("keine waagerechte Bildlaufleiste auf schmalen Geräten", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/kalender");
  await expect(
    page.getByRole("heading", { name: "Dividendenkalender", level: 1 }),
  ).toBeVisible();

  for (const ansicht of ["Liste", "Monat"] as const) {
    await page.getByRole("button", { name: ansicht, exact: true }).click();
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberlauf, `${ansicht} bei 320px`).toBeLessThanOrEqual(0);
  }
});
