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

test("Tägliche Benachrichtigung lässt sich ausschalten", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  const sw = page.getByRole("checkbox", { name: /Neue Reservierungen per Mail/ });
  await expect(sw).toBeChecked();
  await expect(page.getByText("Sofort", { exact: true })).toHaveCount(0);
  await sw.uncheck();
  await expect.poll(() => calls.writes.some((w) => w.includes('"notify_reservations":"off"'))).toBe(true);
});

test("Gruppengeschenk: Eltern sehen Beiträge mit Namen und tragen einen Beitrag ein", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByText("100 € von 300 € von 1 Person")).toBeVisible();
  await page.locator(".wrow-btn", { hasText: "Laufrad gemeinsam" }).click();
  await expect(page.getByRole("button", { name: "Beitrag von Onkel Tobias (100 €) freigeben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Für jemanden reservieren" })).toHaveCount(0);
  await page.getByRole("button", { name: "Beitrag für jemanden eintragen" }).click();
  const dlg = page.locator("dialog.sheet[open]");
  await dlg.getByLabel("Von wem?").fill("Oma Gisela");
  await dlg.getByLabel("Betrag").fill("50");
  await dlg.getByRole("button", { name: "50 € eintragen" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "contribute_for_guest")).toMatchObject({ p_wish: "w4", p_amount_cents: 5000, p_name: "Oma Gisela" });
});

test("Gemeinsam schenken lässt sich nur mit Preis einschalten", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await flow.getByRole("button", { name: /Selbst eintragen/ }).click();
  await flow.getByLabel("Was wird gewünscht?").fill("Trampolin");
  const sw = flow.getByRole("checkbox", { name: /Gemeinsam schenken erlauben/ });
  await expect(sw).toBeDisabled();
  await flow.getByRole("textbox", { name: /^Preis/ }).fill("199");
  await expect(sw).toBeEnabled();
  await sw.check();
  await flow.getByRole("button", { name: "Auf die Liste setzen" }).click();
  await expect.poll(() => calls.writes.some((w) => w.includes('"group_gift":true') && w.includes('"price_cents":19900'))).toBe(true);
});

test("Listen-Einstellung „Wir besorgen Geschenke auf Wunsch“ lässt sich nachträglich einschalten", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const sw = page.getByRole("checkbox", { name: /Wir besorgen Geschenke auf Wunsch/ });
  await expect(sw).not.toBeChecked();
  await sw.check();
  await page.locator("dialog.fsheet[open] .fs-save").click();
  await expect.poll(() => calls.writes.some((w) => w.startsWith("PATCH lists") && w.includes('"allow_parents_buy":true'))).toBe(true);
});

test("Beim Anlegen einer Liste lässt sich „Wir besorgen Geschenke auf Wunsch“ gleich einschalten", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await page.getByRole("button", { name: "Neue Liste" }).click();
  await page.getByLabel(/Name der Liste/).fill("Leons Geburtstag");
  await page.getByRole("checkbox", { name: /Wir besorgen Geschenke auf Wunsch/ }).check();
  await page.locator("dialog.fsheet[open] .fs-save").click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "create_list")).toMatchObject({ p_title: "Leons Geburtstag", p_allow_parents_buy: true });
});

test("Die Funktion „A+“ für große Schrift gibt es nicht mehr", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/#/w/TOK");
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Größere Schrift" })).toHaveCount(0);
});

test("Geschwindigkeit: wichtige Programmteile werden gleich mitgeladen", async ({ request }) => {
  const html = await (await request.get("/")).text();
  for (const teil of ["Dashboard", "ListPage", "GuestPage"]) expect(html).toMatch(new RegExp(`modulepreload[^>]+${teil}-`));
  expect(html).toMatch(/rel="preload" as="font"[^>]+atkinson-hyperlegible-latin-400/);
});

test("Geschwindigkeit: eine Liste erscheint sofort, auch wenn die Datenbank langsam antwortet", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, slowListMs: 2500 });
  await page.goto("/#/");
  await expect(page.locator(".list-row").first()).toBeVisible();
  await page.waitForTimeout(3500); // Leerlauf: die Übersicht lädt die Listen vor
  const start = Date.now();
  await page.locator(".list-row").first().click();
  await expect(page.locator(".wrow-btn").first()).toBeVisible();
  expect(Date.now() - start).toBeLessThan(1000); // ohne Vorladen wären es über 2,5 Sekunden
});
