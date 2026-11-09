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

test("Wunsch über die Suche: 25 Treffer, auswählen, Priorität wählen, speichern", async ({ page }) => {
  const problems = watchProblems(page);
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.getByRole("heading", { name: "Was wünscht sich Emma?" })).toBeVisible();
  await expect(flow.getByText("Schritt 1 von 2")).toBeVisible();
  await flow.getByLabel("Produkt suchen").fill("lego baumhaus");
  await flow.getByLabel("Produkt suchen").press("Enter");
  await expect(flow.locator(".result")).toHaveCount(25);
  await flow.locator(".result").first().click();
  await expect(flow.getByText("Schritt 2 von 2")).toBeVisible();
  await expect(flow.locator(".product-title")).toHaveText("LEGO Friends 42652 Freundschaftsbaumhaus");
  await flow.getByRole("radio", { name: /Herzenswunsch/ }).check();
  await expect(flow.getByRole("radio", { name: /Herzenswunsch/ })).toBeChecked();
  await flow.getByRole("button", { name: "Mehr" }).click();
  await flow.getByRole("button", { name: "Auf die Liste setzen" }).click();
  await expect(flow).toHaveCount(0);
  const post = calls.writes.find((w) => w.startsWith("POST wishes"))!;
  expect(post).toContain('"priority":"heart"');
  expect(post).toContain('"quantity":2');
  expect(post).toContain('"url":"https://www.ebay.de/itm/1000"');
  expect(problems).toEqual([]);
});

test("Wunsch über einen Link: wird ausgelesen und springt automatisch zu Schritt 2", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await flow.getByRole("button", { name: /Link einfügen/ }).click();
  await flow.locator("input[type=url]").fill("https://www.thalia.de/shop/artikel/12345");
  await flow.locator("input[type=url]").press("Enter");
  await expect(flow.locator(".product-title")).toHaveText("Hörbuch-Box für Kinder ab 8");
  // Zurück führt wieder zum Link, nicht ganz an den Anfang
  await flow.getByRole("button", { name: "Zurück" }).click();
  await expect(flow.getByRole("heading", { name: "Link einfügen" })).toBeVisible();
});

test("Wunsch selbst eintragen, und „Weitere Angaben“ enthält Shop, Link und Foto", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 });
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.getByRole("button", { name: "Abbrechen" })).toBeInViewport();
  await flow.getByRole("button", { name: /Selbst eintragen/ }).click();
  await flow.getByLabel("Was wird gewünscht?").fill("Ein Tag im Kletterwald");
  await flow.getByText("Weitere Angaben").click();
  await expect(flow.locator(".more-details input[type=url]")).toBeVisible();
  // Der Speichern-Knopf bleibt auch auf kleinem Bildschirm sichtbar
  await expect(flow.getByRole("button", { name: "Auf die Liste setzen" })).toBeInViewport();
  await flow.getByRole("button", { name: "Auf die Liste setzen" }).click();
  await expect.poll(() => calls.writes.some((w) => w.includes("Kletterwald"))).toBe(true);
});

test("Bearbeiten zeigt die Produktkarte, Name und Preis lassen sich aufklappen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Kinderfahrrad" }).click();
  const edit = page.locator("dialog.fsheet[open]");
  await expect(edit.locator(".product-title")).toHaveText("Kinderfahrrad 24 Zoll");
  await edit.getByRole("button", { name: "Name oder Preis ändern" }).click();
  await expect(edit.getByLabel("Was wird gewünscht?")).toHaveValue("Kinderfahrrad 24 Zoll");
  await edit.getByText("Weitere Angaben").click();
  await expect(edit.locator(".more-details input[type=url]")).toHaveValue("https://www.decathlon.de/x");
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

test("Eltern reservieren für jemanden, der angerufen hat", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Kinderfahrrad" }).click();
  await page.getByRole("button", { name: "Für jemanden reservieren" }).click();
  const dlg = page.locator("dialog.sheet[open]");
  await dlg.getByLabel("Für wen?").fill("Opa Heinz");
  await dlg.getByRole("checkbox", { name: /Wir besorgen das Geschenk/ }).check();
  await dlg.getByRole("button", { name: "Reservieren" }).click();
  await expect(page.locator("#toast")).toContainText("Für Opa Heinz reserviert");
  expect(calls.bodies.find((b) => b.fn === "reserve_for_guest")).toMatchObject({ p_wish: "w1", p_name: "Opa Heinz", p_parents_buy: true, p_quantity: 1 });
});

test("Benachrichtigungen lassen sich auf sofort, täglich oder aus stellen", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  const group = page.getByRole("group", { name: "Benachrichtigung bei Reservierungen" });
  await expect(group.getByRole("button", { name: "Täglich" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Sofort" }).click();
  await expect.poll(() => calls.writes.some((w) => w.includes('"notify_reservations":"instant"'))).toBe(true);
});
