import { expect, test } from "@playwright/test";

/**
 * Rauchtests gegen den gebauten Stand. Sie pruefen genau das, was Unit-Tests
 * nicht sehen koennen: dass die Anwendung nach dem Bauen ueberhaupt startet,
 * dass die nachgeladenen Bereiche ankommen und dass geschuetzte Routen ohne
 * Sitzung zur Anmeldung fuehren.
 *
 * Bewusst ohne Konto und ohne Server: Alles, was Daten braucht, gehoert in
 * tests/integration (echte Datenbank, echte RLS).
 */
test.describe("Rauchtest", () => {
  test("die Anmeldung erscheint und ist bedienbar", async ({ page }) => {
    await page.goto("/#/login");

    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
    await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();

    // Keine weisse Seite: Ein Bundle-Fehler wuerde sich hier zeigen.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.reload();
    expect(errors).toEqual([]);
  });

  test("geschuetzte Bereiche fuehren ohne Sitzung zur Anmeldung", async ({ page }) => {
    await page.goto("/#/eingaenge");
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  });

  test("nachgeladene Bereiche kommen an (Registrierung)", async ({ page }) => {
    await page.goto("/#/login");
    await page.getByRole("link", { name: /Registrieren|Konto erstellen/ }).click();

    await expect(page).toHaveURL(/#\/registrieren/);
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
  });

  test("das Startpaket bleibt schlank", async ({ page }) => {
    const bytes = new Map<string, number>();
    page.on("response", async (response) => {
      const url = new URL(response.url());
      if (!/\.(js|css)$/.test(url.pathname)) return;
      try {
        bytes.set(url.pathname, (await response.body()).byteLength);
      } catch {
        // Antworten ohne Koerper (aus dem Cache bedient) zaehlen nicht.
      }
    });

    // Kein `networkidle`: Der Zustand ist in WebKit unzuverlaessig und kann
    // haengen. Sichtbare Anmeldemaske heisst, dass das Startpaket geladen ist.
    await page.goto("/#/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();

    const total = [...bytes.values()].reduce((sum, value) => sum + value, 0);
    // Ungepackt gemessen; die Grenze haelt Abstand zum heutigen Stand und
    // schlaegt an, wenn jemand eine schwere Abhaengigkeit ins Startpaket holt.
    expect(total).toBeLessThan(1_200_000);
  });

  test("die Anwendung meldet sich mit Titel und Sprache", async ({ page }) => {
    await page.goto("/#/login");
    await expect(page).toHaveTitle(/Dividend Tracker/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("das Manifest ist eingebunden und vollstaendig", async ({ page }) => {
    await page.goto("/#/login");

    const href = await page.locator("link[rel=manifest]").getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.request.get(new URL(href ?? "", page.url()).toString());
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      display: string;
      icons: { sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe("Dividend Tracker");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
