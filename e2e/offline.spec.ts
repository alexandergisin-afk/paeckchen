import { expect, test } from "@playwright/test";
import { LID, mockSupabase } from "./mock";

test.describe("Offline-Modus", () => {
  test.use({ serviceWorkers: "allow" });

  test("Gästeansicht startet ohne Internet mit dem zuletzt geladenen Stand", async ({ page, context }) => {
    await mockSupabase(page);
    await page.goto("/#/w/TOK");
    await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
    // warten, bis der Service Worker die Seite übernommen hat und der Stand gespeichert ist
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("paeckli-offline"))).toBe(true);
    // Netz weg: keine Datenbank, keine Programmdateien aus dem Netz
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
    await expect(page.locator(".gcard .gtitle", { hasText: "Kinderfahrrad" })).toBeVisible();
    await expect(page.getByText(/Offline: Du siehst den zuletzt geladenen Stand/)).toBeVisible();
    await context.setOffline(false);
  });

  test("Liste der Eltern startet ohne Internet, nach dem Abmelden ist nichts mehr gespeichert", async ({ page, context }) => {
    await mockSupabase(page, { signedIn: true });
    await page.goto(`/#/liste/${LID}`);
    await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => (localStorage.getItem("paeckli-offline") ?? "").includes("list:"))).toBe(true);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
    await expect(page.locator(".wrow-btn", { hasText: "Kinderfahrrad" })).toBeVisible();
    await context.setOffline(false);
    // Abmelden löscht den gespeicherten Stand
    await mockSupabase(page, { signedIn: true });
    await page.goto("/#/einstellungen");
    await page.getByRole("button", { name: "Abmelden" }).click();
    expect(await page.evaluate(() => localStorage.getItem("paeckli-offline"))).toBeNull();
  });
});
