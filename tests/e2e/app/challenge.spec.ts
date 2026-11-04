import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * Sport-Challenge (seit 2.67.0): starten, Tage im Raster eintragen,
 * nach dem Neuladen derselbe Stand; ab der
 * Zielzahl führt der Bonus in den Nachkauf. Gespeichert am Profil
 * (Migration 0049).
 */

test("startet eine Challenge und trägt Sporttage ein", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00"));
  await page.goto("/#/challenge");

  await expect(page.getByLabel("Zielzahl Sporttage")).toHaveValue("21");
  await page.getByRole("button", { name: "Challenge starten" }).click();

  const hero = page.getByText("Sporttage November 2026").locator("..");
  await expect(hero).toContainText("0 / 21");

  await page.getByRole("button", { name: /^Montag, 9\. November: offen/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Yoga" }).click();
  await dialog.getByRole("button", { name: "Joggen" }).click();
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  await expect(hero).toContainText("1 / 21");
  // Zukunft ist gesperrt.
  await expect(
    page.getByRole("button", { name: /^Mittwoch, 11\. November/ }),
  ).toBeDisabled();

  await page.getByRole("button", { name: /^Dienstag, 10\. November/ }).click();
  await dialog.getByRole("button", { name: "Krafttraining" }).click();
  await dialog.getByRole("button", { name: "Fertig" }).click();

  await page.reload();
  await expect(hero).toContainText("2 / 21");
  await expect(
    page.getByRole("list", { name: "Aktivitäten nach Häufigkeit" }),
  ).toContainText("Krafttraining");
});

test("schaltet ab der Zielzahl den Bonus frei", async ({ page, konto }) => {
  await asUser(konto.userId, async (client) => {
    const days = Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [`2026-11-0${String(i + 1)}`, ["rad"]]),
    );
    await client.query(`update profiles set sport_challenge = $1::jsonb`, [
      JSON.stringify({ month: "2026-11", target: 3, days, investedAt: null }),
    ]);
  });
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00"));
  await page.goto("/#/challenge");

  const bonus = page.getByRole("region", { name: /Extra-Invest freigeschaltet/ });
  await expect(bonus).toBeVisible();
  await expect(page.getByText("Geschafft")).toBeVisible();
  await bonus.getByRole("button", { name: "Als investiert markieren" }).click();
  await expect(page.getByRole("region", { name: /Extra-Invest erledigt/ })).toContainText(
    "10.11.2026",
  );
  // Bonus-Konto (seit 2.68.0); ohne Depotstand nur der Betrag.
  const bonusKonto = page.getByRole("region", { name: "Was deine Bonusse bringen" });
  await expect(bonusKonto).toContainText("100,00 €");
  await expect(bonusKonto).toContainText("1 Bonus");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(bonusKonto).toBeHidden();
  await page.getByRole("link", { name: "Bonus investieren" }).click();
  await expect(page).toHaveURL(/#\/planer\?betrag=100$/);
});
