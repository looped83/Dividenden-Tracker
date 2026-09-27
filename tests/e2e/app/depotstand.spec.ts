import { fileURLToPath } from "node:url";
import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Depotstand aus dem DivvyDiary-Portfolio-Export (docs/PORTFOLIO_IMPORT.md).
 *
 * Der ganze Weg laeuft hier echt: Datei im Browser lesen, Zuordnung, Anlegen
 * fehlender Assets, Schreiben in die Datenbank durch den **angemeldeten
 * Nutzer** (anders als beim Kalender gibt es keine Edge Function) — samt RLS,
 * Constraints und Triggern.
 *
 * Die Beispieldatei ist erfunden. Ihr Name traegt den Zeitstempel, aus dem der
 * Assistent den Stichtag liest (1785790381565 ms = 3. August 2026).
 */
const BEISPIELDATEI = fileURLToPath(
  new URL("../fixtures/divvydiaryportfolio1785790381565.csv", import.meta.url),
);

test("importiert einen Depotstand und zeigt seine Kennzahlen", async ({
  page,
  konto,
}) => {
  await page.goto("/#/depot");
  await page.getByRole("button", { name: "Depotstand importieren" }).click();
  await page.setInputFiles('input[type="file"]', BEISPIELDATEI);

  // Der Stichtag kommt aus dem Dateinamen, nicht aus dem Inhalt.
  await expect(page.getByLabel("Stichtag des Bestands")).toHaveValue("2026-08-03");

  // Die Bilanz geht auf: drei Zeilen, zwei mit Bestand, eine ohne.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Ohne Bestand", { exact: true })).toBeVisible();

  // „Muster AG" ist angelegt (ohne ISIN, mit Ticker MSTR) und wird ueber den
  // Ticker erkannt; „Beispiel SE" kennt die App noch nicht und wird angelegt.
  await expect(dialog.getByRole("cell", { name: "Muster AG" })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Ticker" })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Wird angelegt" })).toBeVisible();

  await page.getByRole("button", { name: /2 Positionen übernehmen/ }).click();
  await expect(page.getByText(/Depotstand vom 03\.08\.2026 gespeichert/)).toBeVisible({
    timeout: 15_000,
  });
  // Die Schaltflaeche im Fussbereich, nicht das X in der Ecke: Beide tragen
  // denselben zugaenglichen Namen, und der Fussbereich steht im Dokument zuerst
  // (dieselbe Reihenfolge wie in `SecurityImportDialog`).
  await dialog.getByRole("button", { name: "Schließen" }).first().click();

  // Die Kennzahlkacheln rechnen aus dem juengsten Stand: 1.000 + 500 = 1.500 €
  // Depotwert, 40 + 10 = 50 € erwartet, macht 3,33 % Rendite (Summe durch
  // Summe, nicht Mittelwert der Einzelrenditen).
  await expect(page.getByText("Depotwert")).toBeVisible();
  await expect(page.getByText(/1\.500,00/)).toBeVisible();
  await expect(page.getByText(/50,00/).first()).toBeVisible();
  await expect(page.getByText("3,33 %")).toBeVisible();
  await expect(page.getByText("Stand 03.08.2026")).toBeVisible();

  // Zwei Positionen, ein Lauf, und die Zeile ohne Bestand ist als
  // uebersprungen verbucht — die Bilanz steht auch in der Datenbank.
  const gespeichert = await asUser(konto.userId, async (client) => {
    const staende = await client.query<{ anzahl: string; summe: string }>(
      `select count(*)::text as anzahl, coalesce(sum(market_value), 0)::text as summe
         from security_snapshots where as_of = '2026-08-03'`,
    );
    const lauf = await client.query<{
      rows_total: number;
      rows_imported: number;
      rows_skipped: number;
    }>(
      `select rows_total, rows_imported, rows_skipped
         from security_snapshot_runs where as_of = '2026-08-03'`,
    );
    return { staende: staende.rows[0], lauf: lauf.rows[0] };
  });
  expect(gespeichert.staende?.anzahl).toBe("2");
  expect(gespeichert.staende?.summe).toBe("1500.00");
  expect(gespeichert.lauf?.rows_total).toBe(3);
  expect(gespeichert.lauf?.rows_imported).toBe(2);
  expect(gespeichert.lauf?.rows_skipped).toBe(1);

  // Das unbekannte Asset ist angelegt — und „mixed" ist dabei **nicht**
  // als Land oder Branche uebernommen worden.
  const neu = await asUser(konto.userId, async (client) => {
    const result = await client.query<{
      country: string | null;
      sector: string | null;
      isin: string | null;
    }>(`select country, sector, isin from securities where name = 'Beispiel SE'`);
    return result.rows[0];
  });
  expect(neu?.isin).toBe("DE0007654321");
  expect(neu?.country).toBeNull();
  expect(neu?.sector).toBeNull();

  // Die fehlende ISIN von „Muster AG" ist ergaenzt worden — der staerkste
  // Zuordnungsschluessel fuer jeden weiteren Import.
  const ergaenzt = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ isin: string | null; sector: string | null }>(
      "select isin, sector from securities where id = $1",
      [konto.securityId],
    );
    return result.rows[0];
  });
  expect(ergaenzt?.isin).toBe("DE0001234567");
  expect(ergaenzt?.sector).toBe("Industrials");

  // Die Position steht auf der Detailseite des Assets — mit ihrem
  // Stichtag in der Ueberschrift, weil jede Zahl darin nur an diesem Tag galt.
  await page.goto(`/#/depot/${konto.securityId}`);
  const karte = page.getByRole("heading", { name: /^Position Stand 03\.08\.2026$/ });
  await expect(karte).toBeVisible();
  await expect(page.getByText("Erwartet p. a.", { exact: true })).toBeVisible();
  // Rhythmus und die uebrigen Detailwerte stehen unter „Alle Kennzahlen".
  await page.getByText("Alle Kennzahlen").click();
  await expect(page.getByText("vierteljährlich")).toBeVisible();
});

test("ersetzt einen Stand desselben Tages, statt ihn zu verdoppeln", async ({
  page,
  konto,
}) => {
  const importiere = async () => {
    await page.goto("/#/depot");
    await page.getByRole("button", { name: "Depotstand importieren" }).click();
    await page.setInputFiles('input[type="file"]', BEISPIELDATEI);
    await page.getByRole("button", { name: /Positionen übernehmen/ }).click();
    await expect(page.getByText(/Depotstand vom 03\.08\.2026 gespeichert/)).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Schließen" })
      .first()
      .click();
  };

  await importiere();
  await importiere();

  const anzahl = await asUser(konto.userId, async (client) => {
    const staende = await client.query<{ count: string }>(
      "select count(*)::text as count from security_snapshots",
    );
    const laeufe = await client.query<{ count: string }>(
      "select count(*)::text as count from security_snapshot_runs",
    );
    return { staende: staende.rows[0]?.count, laeufe: laeufe.rows[0]?.count };
  });
  // Beim zweiten Durchlauf ist „Beispiel SE" bereits angelegt und wird ueber
  // die ISIN erkannt — es entstehen keine zweiten Zeilen.
  expect(anzahl.staende).toBe("2");
  expect(anzahl.laeufe).toBe("1");
});

/**
 * Ein Stand mit falschem Stichtag laesst sich entfernen. Lag er in der
 * Zukunft, galt er sonst dauerhaft als juengster Stand und verdeckte jeden
 * spaeteren echten Import.
 */
test("löscht einen Depotstand und nennt, welcher Stand danach gilt", async ({
  page,
  konto,
}) => {
  await asUser(konto.userId, async (client) => {
    for (const asOf of ["2026-06-30", "2026-12-31"]) {
      const lauf = await client.query<{ id: string }>(
        `insert into security_snapshot_runs (user_id, as_of, file_name, rows_total, rows_imported)
         values ($1, $2, 'portfolio.csv', 1, 1) returning id`,
        [konto.userId, asOf],
      );
      await client.query(
        `insert into security_snapshots (user_id, security_id, run_id, as_of, quantity, currency)
         values ($1, $2, $3, $4, 10, 'EUR')`,
        [konto.userId, konto.securityId, lauf.rows[0]?.id, asOf],
      );
    }
  });

  await page.goto("/#/einstellungen/importe");
  await page.getByRole("button", { name: "Depotstand vom 31.12.2026 löschen" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/Danach zeigt das Depot den Stand vom 30\.06\.2026\./),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Depotstand löschen" }).click();

  await expect(page.getByText("Depotstand vom 31.12.2026 gelöscht.")).toBeVisible();
  await expect(page.getByText("Stand vom 31.12.2026", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Stand vom 30.06.2026", { exact: true })).toBeVisible();

  const verbleibend = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ as_of: string }>(
      "select to_char(as_of, 'YYYY-MM-DD') as as_of from security_snapshots",
    );
    return result.rows.map((row) => row.as_of);
  });
  expect(verbleibend).toEqual(["2026-06-30"]);
});
