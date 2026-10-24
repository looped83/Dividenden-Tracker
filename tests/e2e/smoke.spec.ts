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

  test.describe("nach einem Deploy", () => {
    // Ohne Service Worker: Er uebernimmt die Seite je nach Tempo des Runners
    // vor oder nach der Anfrage nach dem Teil. Getestet wird hier allein das
    // Neuladen (src/main.tsx); den Service Worker pruefen die Tests unten.
    test.use({ serviceWorkers: "block" });

    test("ein fehlender Teil nach einem Deploy laedt die Seite neu", async ({ page }) => {
      // Wie nach einem Deploy: Der Teil der alten Fassung ist weg. Nur die erste
      // Anfrage scheitert; nach dem Neuladen kommt er an. `no-store`, weil
      // WebKit die 404 sonst fuer dieselbe Adresse wiederverwendet — nach einem
      // echten Deploy fragt die neue Fassung ohnehin andere Dateinamen an.
      let failed = false;
      await page.route(/\/assets\/RegisterPage-[^/]+\.js$/, async (route) => {
        if (failed) return route.continue();
        failed = true;
        return route.fulfill({
          status: 404,
          body: "",
          headers: { "cache-control": "no-store" },
        });
      });

      const log: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("RegisterPage"))
          log.push(`req ${r.url()} ${r.serviceWorker() ? "sw" : ""}`);
      });
      page.on("requestfailed", (r) =>
        log.push(`failed ${r.url()} ${r.failure()?.errorText ?? ""}`),
      );
      page.on("response", (r) => {
        if (r.url().includes("RegisterPage"))
          log.push(`res ${String(r.status())} ${r.url()}`);
      });
      page.on("framenavigated", (f) => log.push(`nav ${f.url()}`));
      page.on("console", (m) => log.push(`console ${m.type()} ${m.text()}`));
      page.on("pageerror", (e) => log.push(`pageerror ${e.message}`));

      await page.goto("/#/registrieren");

      try {
        await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
      } catch (error) {
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const storage = await page
          .evaluate(() => [
            navigator.onLine,
            sessionStorage.getItem("dividend-tracker:chunk-reload"),
          ])
          .catch(() => []);
        throw new Error(
          `DIAG\n${log.join("\n")}\nstorage ${JSON.stringify(storage)}\nbody ${text.slice(0, 500)}\n${String(error)}`,
          { cause: error },
        );
      }
      expect(failed).toBe(true);
    });
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

  test("die Sicherheitsrichtlinie wird ausgeliefert und nichts verstoesst dagegen", async ({
    page,
  }) => {
    const verstoesse: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) {
        verstoesse.push(message.text());
      }
    });

    await page.goto("/#/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();

    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    // Der Platzhalter muss beim Bauen ersetzt worden sein, sonst stuende in
    // `connect-src` kein Ziel.
    expect(policy).not.toContain("%VITE_");
    expect(policy).toMatch(/connect-src [^;]*https:\/\//);

    expect(verstoesse).toEqual([]);
  });

  test("die Anwendung meldet sich mit Titel und Sprache", async ({ page }) => {
    await page.goto("/#/login");
    await expect(page).toHaveTitle(/Dividenden-Tracker/);
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
    expect(manifest.name).toBe("Dividenden-Tracker");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("der Service Worker haelt genau diese Fassung samt Startpaket vor", async ({
    page,
  }) => {
    await page.goto("/#/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    test.skip(
      !(await page.evaluate(() => "serviceWorker" in navigator)),
      "Browser ohne Service Worker",
    );

    // Der Build setzt Kennung und Startpaket in sw.js ein; ohne das schlaegt
    // die Installation fehl und die Seite bekaeme nie einen Controller.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // Erwartet wird, was die ausgelieferte index.html laedt — nicht das
    // Live-DOM: Vites Nachlade-Helfer haengt dort zur Laufzeit weitere
    // `modulepreload`-Links fuer nachgeladene Teile an.
    const html = await (await page.request.get("/")).text();
    const expected = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, "text/html");
      const entry = doc.querySelector<HTMLScriptElement>('script[type="module"][src]');
      const files = [
        ...doc.querySelectorAll(
          'script[type="module"][src], link[rel="modulepreload"], link[rel="stylesheet"]',
        ),
      ].map(
        (element) =>
          new URL(
            element.getAttribute("src") ?? element.getAttribute("href") ?? "",
            location.href,
          ).pathname,
      );
      return {
        cache: `dividend-tracker-shell-${entry?.getAttribute("src")?.split("/").pop() ?? ""}`,
        files,
      };
    }, html);

    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await caches.keys()).filter((key) =>
            key.startsWith("dividend-tracker-shell-"),
          ),
        ),
      )
      .toEqual([expected.cache]);

    const cached = await page.evaluate(
      async (name) =>
        (await (await caches.open(name)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      expected.cache,
    );
    expect(cached).toEqual(expect.arrayContaining(["/", ...expected.files]));
  });
});
