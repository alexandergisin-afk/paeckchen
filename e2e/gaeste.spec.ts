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

test("„Bitte besorgt ihr das Geschenk“ gibt es nur, wenn die Eltern es für die Liste erlauben", async ({ page }) => {
  await mockSupabase(page, { allowParentsBuy: false });
  await page.goto("/#/w/TOK");
  await page.locator(".gcard", { hasText: "Kinderfahrrad" }).getByRole("button", { name: "Reservieren" }).click();
  await expect(page.getByLabel("Dein Name")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Bitte besorgt ihr das Geschenk/ })).toHaveCount(0);
});

test("Gäste können bitten, dass die Eltern das Geschenk besorgen", async ({ page }) => {
  const calls = await mockSupabase(page, { allowParentsBuy: true });
  await page.goto("/#/w/TOK");
  await page.locator(".gcard", { hasText: "Kinderfahrrad" }).getByRole("button", { name: "Reservieren" }).click();
  await page.getByLabel("Dein Name").fill("Oma Gisela");
  await page.getByRole("checkbox", { name: /Bitte besorgt ihr das Geschenk/ }).check();
  await page.getByRole("button", { name: "Jetzt reservieren" }).click();
  await expect(page.getByText("Die Eltern wissen Bescheid")).toBeVisible();
  expect(calls.bodies.find((b) => b.fn === "reserve_wish")).toMatchObject({ p_name: "Oma Gisela", p_parents_buy: true });
});

test("Gruppengeschenk: Gäste sehen nur die Summe und steuern einen Betrag bei", async ({ page }) => {
  const calls = await mockSupabase(page);
  await page.goto("/#/w/TOK");
  const card = page.locator(".gcard", { hasText: "Laufrad gemeinsam" });
  await expect(card.getByText("Gemeinsam schenken")).toBeVisible();
  await expect(card.getByText("1 Person macht mit")).toBeVisible();
  await expect(card).not.toContainText("Onkel Tobias");
  await expect(card.getByRole("button", { name: "Ich schenke es ganz" })).toHaveCount(0); // es gibt schon einen Beitrag
  await card.getByRole("button", { name: "Mitschenken" }).click();
  const dlg = page.locator("dialog.sheet[open]");
  await dlg.getByRole("button", { name: /Rest/ }).click();
  await dlg.getByLabel("Dein Name").fill("Oma Gisela");
  await dlg.getByRole("button", { name: "200 € beisteuern" }).click();
  await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible();
  expect(calls.bodies.find((b) => b.fn === "contribute")).toMatchObject({ p_wish: "w4", p_amount_cents: 20000, p_name: "Oma Gisela" });
});

test("Gruppengeschenk: zu hohe Beträge lassen sich gar nicht erst abschicken", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/#/w/TOK");
  await page.locator(".gcard", { hasText: "Laufrad gemeinsam" }).getByRole("button", { name: "Mitschenken" }).click();
  const dlg = page.locator("dialog.sheet[open]");
  await dlg.getByLabel("Anderer Betrag").fill("250");
  await dlg.getByLabel("Dein Name").fill("Test");
  await expect(dlg.getByText("Höchstens 200 €")).toBeVisible();
  await expect(dlg.getByRole("button", { name: /beisteuern/ })).toBeDisabled();
});
