import { fileURLToPath } from "node:url";
import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Kernablauf 4: Import und Rollback.
 *
 * Der Assistent wird Schritt für Schritt durchlaufen — Datei wählen,
 * Spaltenzuordnung bestätigen, Vorschau, endgültig importieren. Gespeichert
 * wird über die RPC `commit_import` (atomar, serverseitig geprüft); das
 * Zurückrollen über `rollback_import`. Beide laufen hier echt.
 *
 * Die Beispieldatei ist erfunden und liegt im Repository: Der Importtest der
 * Integrationssuite arbeitet mit echten Finanzdaten und überspringt sich
 * deshalb (docs/AUDIT_2026-07-29.md §4.2) — dieser Weg bleibt dadurch
 * mindestens im Browser abgedeckt.
 */
const BEISPIELDATEI = fileURLToPath(
  new URL("../fixtures/dividenden-beispiel.csv", import.meta.url),
);

test("importiert eine CSV-Datei und rollt sie wieder zurück", async ({ page, konto }) => {
  await page.goto("/#/einstellungen/importe");
  await page.getByRole("button", { name: "Neuer Import" }).click();

  await page.setInputFiles('input[type="file"]', BEISPIELDATEI);

  // Schritt 1: Spaltenzuordnung — die Kopfzeilen der Datei werden erkannt,
  // die Währungsbestätigung ist Pflicht.
  await expect(page.getByRole("button", { name: "Weiter zur Zuordnung" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Weiter zur Zuordnung" }).click();

  // Schritt 2: Unternehmen und Depots zuordnen.
  await page.getByRole("button", { name: "Weiter zur Vorschau" }).click();

  // Schritt 3: Vorschau und endgültiger Import.
  const importieren = page.getByRole("button", {
    name: /Eingänge endgültig importieren/,
  });
  await expect(importieren).toBeEnabled();
  await importieren.click();

  await expect(page.getByText(/Import abgeschlossen/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Zur Importübersicht" }).click();

  // Die drei Zeilen der Datei sind gespeichert und tragen die Importherkunft.
  const gespeichert = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ anzahl: string; summe: string }>(
      `select count(*)::text as anzahl, coalesce(sum(net_amount), 0)::text as summe
         from dividend_payments
        where source = 'csv_import' and archived_at is null`,
    );
    return result.rows[0];
  });
  expect(gespeichert?.anzahl).toBe("3");
  expect(gespeichert?.summe).toBe("51.25");

  // Rollback macht den Import vollständig rückgängig; die Rückfrage läuft
  // über `window.confirm` und würde sonst automatisch abgelehnt.
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Rollback" }).click();
  await expect(page.getByText("Zurückgerollt")).toBeVisible({ timeout: 15_000 });

  const danach = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ anzahl: string }>(
      `select count(*)::text as anzahl from dividend_payments
        where source = 'csv_import' and archived_at is null`,
    );
    return result.rows[0];
  });
  expect(danach?.anzahl).toBe("0");
});

/**
 * Ein gescheiterter Import hinterlaesst keinen Entwurf. Frueher stand danach
 * dauerhaft „Wartet auf Bestätigung" in der Historie, ohne dass sich der
 * Eintrag entfernen liess. Das Scheitern wird an der RPC erzwungen — die
 * Datenbank selbst weist eine stimmige Datei nicht ab.
 */
test("räumt den Entwurf auf, wenn der Import scheitert", async ({ page, konto }) => {
  await page.route("**/rest/v1/rpc/commit_import", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "P0001",
        message: "Kontrollsumme Zeilenanzahl weicht ab",
        details: null,
        hint: null,
      }),
    }),
  );

  await page.goto("/#/einstellungen/importe");
  await page.getByRole("button", { name: "Neuer Import" }).click();
  await page.setInputFiles('input[type="file"]', BEISPIELDATEI);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Weiter zur Zuordnung" }).click();
  await page.getByRole("button", { name: "Weiter zur Vorschau" }).click();
  await page.getByRole("button", { name: /Eingänge endgültig importieren/ }).click();

  await expect(page.getByText("Kontrollsumme Zeilenanzahl weicht ab")).toBeVisible();
  await expect
    .poll(() =>
      asUser(konto.userId, async (client) => {
        const result = await client.query<{ anzahl: string }>(
          "select count(*)::text as anzahl from imports",
        );
        return result.rows[0]?.anzahl;
      }),
    )
    .toBe("0");
});

test("löscht einen liegengebliebenen Entwurf aus der Importübersicht", async ({
  page,
  konto,
}) => {
  await asUser(konto.userId, (client) =>
    client.query(
      `insert into imports (user_id, file_name, file_hash, file_size_bytes, file_type, status)
       values ($1, 'alt.csv', repeat('a', 64), 100, 'csv', 'pending_confirmation')`,
      [konto.userId],
    ),
  );

  await page.goto("/#/einstellungen/importe");
  await expect(page.getByText("Wartet auf Bestätigung")).toBeVisible();
  await page.getByRole("button", { name: "Entwurf alt.csv löschen" }).click();

  await expect(page.getByText("Noch keine Importe")).toBeVisible();
  const verbleibend = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ anzahl: string }>(
      "select count(*)::text as anzahl from imports",
    );
    return result.rows[0]?.anzahl;
  });
  expect(verbleibend).toBe("0");
});
