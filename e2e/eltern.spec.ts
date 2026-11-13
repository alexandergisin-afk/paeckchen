import { expect, test } from "@playwright/test";
import { LID, LID2, mockSupabase, watchProblems } from "./mock";

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
  await expect(sw).toBeEnabled(); // erst wenn die Einstellungen geladen sind
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

test("Zuletzt gesuchte Begriffe gehören der Person und lassen sich einzeln entfernen", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, recent: ["Hörspiel", "Fahrradhelm"] });
  await page.addInitScript(() => localStorage.setItem("paeckli-recent-searches", JSON.stringify(["Vom Gerät"])));
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.getByRole("button", { name: "Hörspiel", exact: true })).toBeVisible();
  await expect(flow.getByRole("button", { name: "Vom Gerät", exact: true })).toHaveCount(0); // alter Gerätespeicher zählt nicht
  await flow.getByRole("button", { name: "„Hörspiel“ aus den letzten Suchen entfernen" }).click();
  await expect(flow.getByRole("button", { name: "Hörspiel", exact: true })).toHaveCount(0);
  await expect.poll(() => calls.writes.some((w) => w.startsWith("POST recent_searches") && w.includes('"terms":["Fahrradhelm"]'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("paeckli-recent-searches"))).toBeNull();
});

test("Zuletzt gesucht zeigt und speichert höchstens 3 Begriffe, der neueste vorne", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, recent: ["Hörspiel", "Fahrradhelm", "Bastelset"] });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.locator(".recent-term")).toHaveCount(3);
  await flow.getByLabel("Produkt suchen").fill("Lego Baumhaus");
  await flow.getByLabel("Produkt suchen").press("Enter");
  await expect.poll(() => calls.writes.some((w) => w.startsWith("POST recent_searches") && w.includes('"terms":["Lego Baumhaus","Hörspiel","Fahrradhelm"]'))).toBe(true);
});

test("Zugriff verwalten erklärt, wer was darf", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen/zugriff");
  await page.getByText("Wer darf was?").click();
  const row = page.getByRole("row", { name: /Liste löschen/ });
  await expect(row.getByRole("cell").nth(0)).toHaveText("✓");
  await expect(row.getByRole("cell").nth(1)).toHaveText("–");
  await expect(page.getByRole("row", { name: /Wünsche hinzufügen/ }).getByRole("cell").nth(1)).toHaveText("✓");
});

test("Listen in der Übersicht sortieren", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  const titles = page.locator(".list-row .list-title");
  await expect(titles).toHaveText(["Leons Weihnachten", "Emmas 9. Geburtstag"]); // eigene Reihenfolge: neue oben
  await page.getByLabel("Listen sortieren").selectOption("name");
  await expect(titles).toHaveText(["Emmas 9. Geburtstag", "Leons Weihnachten"]);
  await expect.poll(() => calls.writes.some((w) => w.startsWith("PATCH profiles") && w.includes('"list_sort":"name"'))).toBe(true);
});

async function holdAndDrag(page: import("@playwright/test").Page, row: import("@playwright/test").Locator, dy: number, holdMs = 650) {
  const box = (await row.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (dy * i) / 10);
  await page.mouse.up();
}

test("Listen gedrückt halten und ziehen: wird sofort gespeichert, ohne die Liste zu öffnen", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await expect(page.getByText("Tipp: Liste gedrückt halten")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verschieben" })).toHaveCount(0);
  const titles = page.locator(".list-row .list-title");
  await expect(titles).toHaveText(["Leons Weihnachten", "Emmas 9. Geburtstag"]);
  const emma = page.locator(".list-row", { hasText: "Emmas 9. Geburtstag" });
  const rowH = (await emma.boundingBox())!.height;
  await holdAndDrag(page, emma, -rowH);
  await expect(titles).toHaveText(["Emmas 9. Geburtstag", "Leons Weihnachten"]);
  await expect.poll(() => calls.bodies.find((b) => b.fn === "set_list_order")).toMatchObject({ p_ids: [LID, LID2] });
  await expect(page).toHaveURL(/#\/$/); // die Liste wurde nicht geöffnet
  await expect(page.getByText("Tipp: Liste gedrückt halten")).toHaveCount(0); // Hinweis verschwindet nach dem ersten Mal
});

test("Kurz tippen öffnet die Liste weiterhin", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await page.locator(".list-row", { hasText: "Emmas 9. Geburtstag" }).click();
  await expect(page).toHaveURL(new RegExp(`#/liste/${LID}`));
});

test("Sofort bewegen (wie beim Scrollen) verschiebt nichts", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  const emma = page.locator(".list-row", { hasText: "Emmas 9. Geburtstag" });
  await holdAndDrag(page, emma, -120, 50);
  await expect(page.locator(".list-row .list-title")).toHaveText(["Leons Weihnachten", "Emmas 9. Geburtstag"]);
  expect(calls.bodies.find((b) => b.fn === "set_list_order")).toBeUndefined();
});

test("Listen verschieben geht auch mit der Tastatur (Alt + Pfeil)", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await page.locator(".list-row", { hasText: "Leons Weihnachten" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => calls.bodies.find((b) => b.fn === "set_list_order")).toMatchObject({ p_ids: [LID, LID2] });
});

test("Geteilter Wunsch: Schritt 2 lässt sich abbrechen, „Zurück“ springt nicht wieder vor", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}?neu=${encodeURIComponent("https://www.thalia.de/shop/artikel/12345")}`);
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.locator(".product-title")).toHaveText("Hörbuch-Box für Kinder ab 8");
  await expect(flow.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  // Zurück: bleibt beim Link, statt automatisch wieder zu Schritt 2 zu springen
  await flow.getByRole("button", { name: "Zurück" }).click();
  await expect(flow.getByRole("heading", { name: "Link einfügen" })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(flow.getByRole("heading", { name: "Link einfügen" })).toBeVisible();
  await expect(flow.locator("input[type=url]")).toHaveValue("https://www.thalia.de/shop/artikel/12345");
  // Weiter führt wieder zu Schritt 2, Abbrechen schließt
  await flow.getByRole("button", { name: "Weiter" }).click();
  await expect(flow.locator(".product-title")).toBeVisible();
  await flow.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("dialog.add-flow[open]")).toHaveCount(0);
});

test("„Abbrechen“ ist in jedem Schritt da", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Wunsch hinzufügen" }).click();
  const flow = page.locator("dialog.add-flow[open]");
  await expect(flow.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  await flow.getByRole("button", { name: /Link einfügen/ }).click();
  await expect(flow.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  await flow.getByRole("button", { name: "Zurück" }).click();
  await flow.getByRole("button", { name: /Selbst eintragen/ }).click();
  await expect(flow.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  await expect(flow.getByRole("button", { name: "Zurück" })).toBeVisible();
});

test("Wunsch direkt im Shop öffnen: beim Bearbeiten oben und in der Liste", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  const rowLink = page.getByRole("link", { name: "„Kinderfahrrad 24 Zoll“ bei Decathlon öffnen" });
  await expect(rowLink).toHaveAttribute("href", "https://www.decathlon.de/x");
  await expect(rowLink).toHaveAttribute("target", "_blank");
  // Wünsche ohne Link haben keinen Shop-Knopf
  await expect(page.getByRole("link", { name: /„Schwimmbrille“.*öffnen/ })).toHaveCount(0);
  // Der Rest der Zeile öffnet weiterhin das Bearbeiten
  await page.locator(".wrow-btn", { hasText: "Kinderfahrrad" }).click();
  const top = page.locator("dialog.fsheet[open] .product-card").getByRole("link", { name: "Bei Decathlon öffnen" });
  await expect(top).toHaveAttribute("href", "https://www.decathlon.de/x");
  await page.locator("dialog.fsheet[open] .fs-cancel").click();
  // Auch in der Kachelansicht
  await page.getByRole("button", { name: "Kacheln" }).click();
  await expect(page.locator(".wcard-wrap").getByRole("link", { name: "„Kinderfahrrad 24 Zoll“ bei Decathlon öffnen" })).toBeVisible();
});

test("Reservierungen ausblenden: schmale Zeile mit einem Knopf", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  const bar = page.getByRole("region", { name: "Stand der Reservierungen" });
  await expect(bar).toContainText("vergeben");
  expect((await bar.boundingBox())!.height).toBeLessThan(60);
  await bar.getByRole("button", { name: "Reservierungen für mich ausblenden" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "set_show_reservations")).toMatchObject({ p_list: LID, p_show: false });
});

test("Unbekannte Adresse: statt Fehlermeldung geht eine Anfrage an die Verwaltung", async ({ page }) => {
  const calls = await mockSupabase(page, { loginBlocked: true });
  await page.goto("/#/");
  await page.getByLabel(/E-Mail/).fill("neu@test.de");
  await page.getByRole("button", { name: /Anmelde-Mail/ }).click();
  await expect(page.getByRole("heading", { name: "Deine Anfrage ist unterwegs" })).toBeVisible();
  expect(calls.bodies.find((b) => b.fn === "zugang")).toMatchObject({ action: "request", email: "neu@test.de" });
  await page.getByRole("button", { name: "Ich habe den Code schon" }).click();
  await expect(page.getByLabel("Code aus der Mail")).toBeVisible();
});

test("Einladen ohne Administratorrechte: Hinweis, dass die Freigabe noch aussteht", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, invitePending: true });
  await page.goto(`/#/liste/${LID}/mitglieder`);
  await page.getByRole("button", { name: "Zum Mitbearbeiten einladen" }).click();
  await page.getByLabel("E-Mail-Adresse der Person").fill("anna@test.de");
  await page.getByRole("button", { name: "Einladungslink erstellen" }).click();
  await expect(page.getByText("Wartet auf Freigabe:")).toBeVisible();
  expect(calls.bodies.find((b) => b.fn === "zugang")).toMatchObject({ action: "invite", email: "anna@test.de", list_id: LID });
});

test("Administratoren sehen Zugangsanfragen und geben frei", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, admin: true });
  await page.goto("/#/einstellungen");
  await expect(page.getByRole("link", { name: /Zugangsanfragen/ })).toContainText("1");
  await page.getByRole("link", { name: /Zugangsanfragen/ }).click();
  await expect(page.getByText("Eingeladen von Markus zu „Emmas 9. Geburtstag“")).toBeVisible();
  await page.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.locator("#toast")).toContainText("bekommt jetzt die Mail mit dem Code");
  expect(calls.bodies.find((b) => b.fn === "zugang")).toMatchObject({ action: "decide", id: "req1", approve: true });
});

test("Nicht-Administratoren sehen keine Zugangsanfragen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zugangsanfragen/ })).toHaveCount(0);
});

test("Statistik: Listen oben auswählen, Alle ist eine Option", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/statistik");
  const picker = page.getByRole("group", { name: "Liste auswählen" });
  await expect(picker.getByRole("button", { name: "Alle Listen" })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Emmas 9. Geburtstag" }).click();
  await expect(picker.getByRole("button", { name: "Emmas 9. Geburtstag" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stats-for")).toContainText("Emmas 9. Geburtstag");
  await picker.getByRole("button", { name: "Alle Listen" }).click();
  await expect(page.locator(".stats-for")).toHaveCount(0);
});

test("Nach unten ziehen lädt die Liste neu", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
  const before = calls.lists.filter((u) => u.includes(`id=eq.${LID}`)).length;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 300 }] });
  for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 300 + i * 18 }] });
  await expect(page.getByText("Zum Aktualisieren loslassen")).toBeAttached();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => calls.lists.filter((u) => u.includes(`id=eq.${LID}`)).length).toBeGreaterThan(before);
});
