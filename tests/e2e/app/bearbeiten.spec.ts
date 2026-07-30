import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Kernablauf 2: einen erfassten Eingang ändern.
 *
 * Neben der Oberfläche prüft der Test die gespeicherte Zeile: Der Betrag muss
 * in der Datenbank ankommen, und die Herkunft (`source`) darf sich beim
 * Bearbeiten nicht verändern — dafür sorgt der Trigger
 * `protect_payment_immutables`.
 */
test.use({ seed: { payments: [{ payDate: "2026-04-08", netAmount: "50.00" }] } });

test("ändert den Betrag eines Eingangs", async ({ page, konto }) => {
  const id = konto.paymentIds[0] ?? "";
  await page.goto(`/#/eingaenge/${id}/bearbeiten`);
  await expect(page.getByRole("heading", { name: "Dividende bearbeiten" })).toBeVisible();

  const betrag = page.getByLabel("Nettobetrag");
  // „50", nicht „50,00": PostgREST liefert `numeric` als JSON-Zahl, damit
  // fallen die Nachkommanullen schon im Transport weg. Die Brücke bildet das
  // bewusst genauso ab — sonst prüfte der Test einen Wert, den die Anwendung
  // nie zu sehen bekommt.
  await expect(betrag).toHaveValue("50");
  await betrag.fill("77,77");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText("Dividende gespeichert.")).toBeVisible();
  await expect(page.getByText("77,77").first()).toBeVisible();

  const row = await asUser(konto.userId, async (client) => {
    const result = await client.query<{ net_amount: string; source: string }>(
      "select net_amount, source from dividend_payments where id = $1",
      [id],
    );
    return result.rows[0];
  });
  expect(row?.net_amount).toBe("77.77");
  expect(row?.source).toBe("manual");
});
