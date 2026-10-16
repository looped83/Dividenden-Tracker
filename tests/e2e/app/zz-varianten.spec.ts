import { expect, test } from "../support/appTest";
import { asUser } from "../support/db";

const v2026 = ["980","1020","1150","1090","1240","1110","1633.84","870","1095.06","1104.46"];
const v2025 = ["700","760","820","790","900","830","1180","690","860","780","920","1010"];
const pay = (y: number, vals: string[]) =>
  vals.map((n, i) => ({ payDate: `${String(y)}-${String(i + 1).padStart(2, "0")}-${y === 2026 && i === 9 ? "10" : "15"}`, netAmount: n }));

test.use({ seed: { payments: [...pay(2025, v2025), ...pay(2026, v2026)] } });

const OUT = process.env.OUT_DIR ?? "shots";

for (const variante of ["vorher", "a", "b", "c"]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${variante} ${scheme}`, async ({ page, konto }, info) => {
      await asUser(konto.userId, async (c) => {
        await c.query("insert into goals (user_id, goal_type, year, target_amount) values ($1,'annual',2026,12000)", [konto.userId]);
        await c.query("insert into goals (user_id, goal_type, year, month, target_amount) values ($1,'monthly',2026,10,1300)", [konto.userId]);
      });
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((v) => {
        localStorage.setItem("variante-umschalter", v === "vorher" ? "" : v);
      }, variante);
      await page.goto("/#/");
      await expect(page.getByText("Prognose")).toBeVisible();
      await page.waitForTimeout(600);
      const dev = info.project.name === "iPhone" ? "mobil" : "desktop";
      const clip = dev === "mobil" ? { x: 0, y: 0, width: 390, height: 700 } : { x: 0, y: 0, width: 1280, height: 760 };
      await page.screenshot({ path: `${OUT}/${variante}-${dev}-${scheme}-kumuliert.png`, clip });
      await page.getByRole("radio", { name: "Monatlich" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${variante}-${dev}-${scheme}-monatlich.png`, clip });
    });
  }
}
