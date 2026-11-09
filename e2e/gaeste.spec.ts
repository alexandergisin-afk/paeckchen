import { expect, test } from "@playwright/test";
import { mockSupabase, watchProblems } from "./mock";

test("Gäste sehen die Liste ohne Anmeldung, filtern und reservieren mit Namen", async ({ page }) => {
  const problems = watchProblems(page);
  const calls = await mockSupabase(page);
  await page.goto("/#/w/TOK");
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
  await expect(page.getByText("Anmelde-Mail schicken")).toHaveCount(0);

  // Nichts ragt über den Bildschirmrand
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Preisfilter
  await page.getByRole("button", { name: "bis 20 €" }).click();
  await expect(page.locator(".gcard h3", { hasText: "Kinderfahrrad" })).toHaveCount(0);
  await page.getByRole("button", { name: "Alle", exact: true }).click();

  // Reservieren: ohne Namen geht es nicht
  await page.locator(".gcard", { hasText: "Kinderfahrrad" }).getByRole("button", { name: "Reservieren" }).click();
  await page.getByRole("button", { name: "Jetzt reservieren" }).click();
  expect(calls.rpc).not.toContain("reserve_wish");
  await page.getByLabel("Dein Name").fill("Oma Gisela");
  await page.getByRole("button", { name: "Jetzt reservieren" }).click();
  await expect(page.getByRole("heading", { name: "Reserviert!" })).toBeVisible();
  expect(calls.rpc).toContain("reserve_wish");

  expect(problems).toEqual([]);
});

test("Gästeansicht lässt sich zwischen Kacheln und Liste umschalten und merkt sich die Wahl", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/#/w/TOK");
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(page.locator(".ggrid.rows")).toBeVisible();
  await page.reload();
  await expect(page.locator(".ggrid.rows")).toBeVisible();
});
