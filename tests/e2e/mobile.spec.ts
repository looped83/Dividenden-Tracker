import { expect, test } from "@playwright/test";

/**
 * Verhalten auf dem Telefon, gegen den gebauten Stand.
 *
 * Zwei Zusagen, die sich nur im Browser pruefen lassen und die zusammenhaengen:
 *
 * 1. **Kein selbsttaetiger Zoom.** iOS Safari zoomt die Seite, sobald ein Feld
 *    mit einer Schrift unter 16 px den Fokus bekommt — und nach dem Zoom laesst
 *    sich die Seite seitlich verschieben. Geprueft wird deshalb die gerechnete
 *    Schriftgroesse jedes Formularfeldes. Das ist eine CSS-Aussage und gilt
 *    auch unter Chromium; der Zoom selbst gehoert Safari.
 * 2. **Keine seitliche Verschiebung.** Was breiter ist als das Fenster, wird
 *    entweder umgebrochen oder scrollt innerhalb seines eigenen Rahmens — die
 *    Seite selbst nicht.
 *
 * Der Pinch-Zoom bleibt ausdruecklich moeglich (`user-scalable` unangetastet):
 * Wer Text vergroessern muss, darf das (WCAG 1.4.4).
 */
const OEFFENTLICHE_ROUTEN = [
  { pfad: "/#/login", name: "Anmelden" },
  { pfad: "/#/registrieren", name: "Registrieren" },
  { pfad: "/#/passwort-vergessen", name: "Passwort vergessen" },
];

test.describe("Telefon", () => {
  // Die Regel gilt unterhalb des `sm`-Haltepunkts (640 px); darueber ist die
  // kleinere Schrift gewollt.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= 640,
    "gilt nur fuer schmale Viewports",
  );

  for (const route of OEFFENTLICHE_ROUTEN) {
    test(`${route.name}: Formularfelder sind mindestens 16 px gross`, async ({
      page,
    }) => {
      await page.goto(route.pfad);
      await expect(page.getByRole("heading", { name: route.name })).toBeVisible();

      const zuKlein = await page.evaluate(() =>
        [...document.querySelectorAll("input, select, textarea")]
          .filter((element) => {
            // Verborgene Felder (Dateiauswahl) loesen keinen Zoom aus.
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((element) => ({
            feld: element.id || (element.getAttribute("name") ?? element.tagName),
            px: Number.parseFloat(getComputedStyle(element).fontSize),
          }))
          .filter((feld) => feld.px < 16),
      );

      expect(zuKlein).toEqual([]);
    });

    test(`${route.name}: die Seite laeuft nicht seitlich ueber`, async ({ page }) => {
      await page.goto(route.pfad);
      await expect(page.getByRole("heading", { name: route.name })).toBeVisible();

      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(ueberlauf).toBeLessThanOrEqual(0);
    });
  }

  test("Pinch-Zoom bleibt erlaubt", async ({ page }) => {
    // Der selbsttaetige Zoom wird ueber Schriftgroessen vermieden, nicht durch
    // ein Verbot: `maximum-scale`/`user-scalable` sperren sonst auch die
    // absichtliche Vergroesserung.
    await page.goto("/#/login");
    const viewport = await page.getAttribute('meta[name="viewport"]', "content");
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    expect(viewport).not.toMatch(/maximum-scale/);
  });
});
