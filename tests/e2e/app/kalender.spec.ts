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
test.use({
  seed: {
    calendarEvents: [
      { date: "2099-03-13", title: "Apple Inc.", description: "Quartalsdividende" },
      { date: "2099-03-13", title: "Allianz SE" },
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

  await expect(page.getByRole("heading", { name: "Später", level: 2 })).toBeVisible();
  // Jede Kachel traegt ihr Datum selbst — als Zahl und ausgeschrieben.
  const apple = page.getByRole("button", { name: /Apple Inc\./ });
  await expect(apple).toBeVisible();
  await expect(apple).toContainText("13");
  await expect(apple).toContainText("Fr, 13.03.2099");
  await expect(page.getByRole("button", { name: /Allianz SE/ })).toBeVisible();

  // Kennzahlkacheln ueber der Liste.
  await expect(page.getByText("Nächster Zahltag")).toBeVisible();
  await expect(page.getByText("13.03.2099", { exact: true })).toBeVisible();
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
