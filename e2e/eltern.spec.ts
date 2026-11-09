import { expect, test } from "@playwright/test";
import { LID, mockSupabase, watchProblems } from "./mock";

test("Listenseite lädt mit einer einzigen Abfrage und zeigt Reservierungen", async ({ page }) => {
  const problems = watchProblems(page);
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
  await expect(page.getByText("Reserviert von Oma Gisela")).toBeVisible();
  await expect(page.getByText("1 reserviert von Familie Yilmaz, noch 2 frei")).toBeVisible();
  expect(calls.lists.filter((u) => u.includes(`id=eq.${LID}`))).toHaveLength(1);
  expect(problems).toEqual([]);
});

test("Formulare behalten Abbrechen und Speichern auch bei wenig Platz im Blick", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 });
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const save = page.locator("dialog.fsheet[open] .fs-save");
  const cancel = page.locator("dialog.fsheet[open] .fs-cancel");
  await expect(save).toBeInViewport();
  await expect(cancel).toBeInViewport();
  const [s, c] = [await save.boundingBox(), await cancel.boundingBox()];
  expect(c!.x + c!.width).toBeLessThan(s!.x); // nichts überlappt
});

test("Statistik zeigt alle Bereiche", async ({ page }) => {
  const problems = watchProblems(page);
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/statistik");
  for (const h of ["Stand", "Geld", "Schenkende", "Zeitverlauf", "Rückblick"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  expect(problems).toEqual([]);
});
