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
  await expect(page.getByRole("button", { name: "Beitrag von Onkel Tobias (100 €) aufheben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Für jemanden reservieren" })).toHaveCount(0);
  const panel = page.getByRole("region", { name: "Beiträge zum Gruppengeschenk" });
  await expect(panel).toContainText("Onkel Tobias");
  await expect(panel).toContainText(/es fehlen noch 200\s€/);
  await panel.getByRole("button", { name: "Beitrag eintragen" }).click();
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
  await expect(page.getByRole("link", { name: /Zugangsanfragen/ })).toContainText("2");
  await expect(page.getByRole("link", { name: /Zugangsanfragen/ })).toContainText("Neue Konten warten auf deine Freigabe");
  await page.getByRole("link", { name: /Zugangsanfragen/ }).click();
  await expect(page.getByText("Eingeladen von Markus zu „Emmas 9. Geburtstag“")).toBeVisible();
  await page.locator(".request", { hasText: "anna@test.de" }).getByRole("button", { name: "Freigeben" }).click();
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

test("Wunsch ohne Reservierung löschen: sofort weg, mit „Rückgängig“", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Kinderfahrrad" }).click();
  await page.getByRole("button", { name: "Wunsch löschen" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0); // keine Rückfrage
  await expect(page.locator(".wrow-btn", { hasText: "Kinderfahrrad" })).toHaveCount(0);
  await page.locator("#toast").getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.locator(".wrow-btn", { hasText: "Kinderfahrrad" })).toBeVisible();
  await page.waitForTimeout(6500);
  expect(calls.writes.some((w) => w.startsWith("DELETE wishes"))).toBe(false); // nichts gelöscht
});

test("Wunsch löschen ohne Rückgängig: wird nach kurzer Zeit wirklich gelöscht", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Kinderfahrrad" }).click();
  await page.getByRole("button", { name: "Wunsch löschen" }).click();
  await expect.poll(() => calls.writes.some((w) => w.startsWith("DELETE wishes") && w.includes("w1")), { timeout: 9000 }).toBe(true);
});

test("Wunsch mit fremder Reservierung löschen: Rückfrage nennt die Person", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Schwimmbrille" }).click();
  await page.getByRole("button", { name: "Wunsch löschen" }).click();
  await expect(page.locator("dialog.sheet[open]")).toContainText("Oma Gisela hat diesen Wunsch schon reserviert");
});

test("Reservierung aufheben: sofort, mit „Rückgängig“", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.locator(".wrow-btn", { hasText: "Schwimmbrille" }).click();
  await page.getByRole("button", { name: /Reservierung von Oma Gisela aufheben/ }).click();
  await expect(page.locator("#toast")).toContainText("Reservierung von Oma Gisela aufgehoben");
  await page.locator("#toast").getByRole("button", { name: "Rückgängig" }).click();
  await page.waitForTimeout(6500);
  expect(calls.writes.some((w) => w.startsWith("DELETE reservations"))).toBe(false);
});

test("Einstellungen: in Gruppen geordnet, Name speichert sich automatisch", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  for (const g of ["Konto", "Familie & Zugriff", "Benachrichtigungen", "App"]) {
    await expect(page.getByRole("heading", { name: g, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Name speichern" })).toHaveCount(0);
  await page.getByLabel(/Dein Name/).fill("Julia M.");
  await expect(page.getByText("Gespeichert ✓")).toBeVisible();
  await expect.poll(() => calls.writes.filter((w) => w.startsWith("PATCH profiles") && w.includes('"display_name":"Julia M."')).length).toBe(1); // genau einmal
  await expect(page.getByLabel(/Dein Name/)).toHaveValue("Julia M."); // springt nicht zurück
  // Die lange iPhone-Anleitung ist eingeklappt
  await expect(page.getByText("In der App Kurzbefehle", { exact: false })).toBeHidden();
});

test("Leere Liste: erster Schritt statt Teilen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, emptyList: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByRole("heading", { name: "Was wünscht sich Emma?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Teilen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ersten Wunsch hinzufügen" }).click();
  await expect(page.locator("dialog.add-flow[open]")).toBeVisible();
});

test("Beim Laden erscheinen Platzhalter statt Text", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, slowListMs: 1500 });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByRole("status", { name: "Liste wird geladen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
});

test("Vom Stand der Liste direkt zur passenden Statistik und zurück", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("link", { name: /vergeben/ }).click();
  await expect(page).toHaveURL(new RegExp(`statistik\\?liste=${LID}`));
  await expect(page.getByRole("group", { name: "Liste auswählen" }).getByRole("button", { name: "Emmas 9. Geburtstag" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Zur Liste" }).click();
  await expect(page).toHaveURL(new RegExp(`#/liste/${LID}`));
});

test("Übersicht zeigt bei jeder Liste, wie lange es noch dauert", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await expect(page.locator(".list-row", { hasText: "Emmas 9. Geburtstag" }).locator(".days-chip")).toHaveText(/^(heute|morgen|in \d+ Tagen)$/);
});

test("Einheitliche Begriffe und kurze Preise", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByText("349 €", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("349,00 €")).toHaveCount(0);
  await page.goto(`/#/liste/${LID}/mitglieder`);
  await expect(page.getByText("Mitbearbeitung")).toHaveCount(0);
});

test("Keine Seite ragt über den Bildschirmrand, auch mit vielen Listen und auf 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockSupabase(page, { signedIn: true });
  // Statistik mit sieben langen Listennamen
  const many = Array.from({ length: 7 }, (_, i) => ({
    id: i === 0 ? LID : `l${i}`, title: ["Emmas 9. Geburtstag", "Leons Weihnachtswünsche 2026", "Omas 80. Geburtstag im Februar",
      "Ostern bei den Großeltern", "Emmas Einschulung", "Weihnachten 2025", "Leons 6. Geburtstag"][i],
    recipient_name: "Emma", event_date: "2026-12-14", archived_at: i > 4 ? "2026-01-05" : null,
    list_members: [{ user_id: "11111111-1111-1111-1111-111111111111", show_reservations: true }],
  }));
  // nur die Abfrage der Statistik ersetzen (die anderen Seiten fragen Listen in anderer Form ab)
  await page.route((url) => decodeURIComponent(url.href).includes("archived_at,list_members(user_id,show_reservations)"), (r) => r.fulfill({ json: many }));
  for (const path of ["/#/", `/#/liste/${LID}`, "/#/statistik", `/#/statistik?liste=l4`, "/#/einstellungen", "/#/einstellungen/zugriff", "/#/w/TOK"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `Seite ${path} ist ${width}px breit`).toBeLessThanOrEqual(320);
  }
  // Die Listen-Auswahl der Statistik lässt sich wischen und zeigt die gewählte Liste
  await page.goto("/#/statistik?liste=l4");
  const picker = page.getByRole("group", { name: "Liste auswählen" });
  await expect(picker.getByRole("button", { name: "Emmas Einschulung" })).toBeInViewport();
});

test("Nach einem Absturz auf einer Seite funktionieren die anderen Seiten weiter", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  // Listenseite bekommt kaputte Daten und stürzt ab
  await page.route((url) => url.href.includes(`id=eq.${LID}`), (r) => r.fulfill({ json: { id: LID, title: "Kaputt", list_members: 5, wishes: [] } }));
  await page.goto(`/#/liste/${LID}`);
  await expect(page.getByRole("heading", { name: "Da ist etwas schiefgelaufen." })).toBeVisible();
  // Wechsel zur Statistik: die Seite erscheint normal, nicht wieder die Fehlermeldung
  await page.goto("/#/statistik");
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Da ist etwas schiefgelaufen." })).toHaveCount(0);
});

test("Verlauf einer Liste: in Sätzen, nach Tagen gruppiert, aus dem Bearbeiten-Menü erreichbar", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await page.getByRole("link", { name: "Verlauf ansehen" }).click();
  await expect(page.getByRole("heading", { name: "Verlauf", exact: true })).toBeVisible();
  const heute = page.getByRole("region", { name: "Heute" });
  await expect(heute).toContainText("Oma Gisela hat „Kinderfahrrad 24 Zoll“ reserviert (ihr besorgt es).");
  await expect(heute).toContainText(/Julia hat „Kinderfahrrad 24 Zoll“ geändert: Preis von 349\s€ auf 329\s€\./);
  await expect(page.getByRole("region", { name: "Gestern" })).toContainText("Markus ist der Liste als Mitbearbeiter beigetreten.");
  await page.getByRole("link", { name: "Zur Liste" }).click();
  await expect(page).toHaveURL(new RegExp(`#/liste/${LID}$`));
});

test("Sicherheitsprotokoll nur für Administratoren", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, admin: true });
  await page.goto("/#/einstellungen");
  await page.getByRole("link", { name: /Sicherheitsprotokoll/ }).click();
  await expect(page.getByText("Julia hat anna@test.de freigegeben.")).toBeVisible();
});

test("Ohne Administratorrechte kein Sicherheitsprotokoll in den Einstellungen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sicherheitsprotokoll/ })).toHaveCount(0);
});

test("Gruppengeschenk: in der Liste steht, wer sich mit wie viel beteiligt", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  await expect(page.locator(".wrow-btn", { hasText: "Laufrad gemeinsam" }).locator(".contrib-names")).toHaveText(/Onkel Tobias 100\s€/);
});

test("Konto zum Schenken: keine eigenen Listen, keine Statistik, schlanke Einstellungen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, guestAccount: true });
  await page.goto("/#/");
  await expect(page.getByRole("region", { name: "Wunschlisten zum Schenken" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Neue Liste" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Statistik" })).toHaveCount(0);
  await page.goto("/#/einstellungen");
  await expect(page.getByRole("heading", { name: "Konto", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zugriff verwalten/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Benachrichtigungen" })).toHaveCount(0);
});

test("Familienkonto: „Neue Liste“ wie gewohnt", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await expect(page.getByRole("button", { name: "Neue Liste" })).toBeVisible();
});

test("Freigeben mit Kontoart: ohne Einladung „Zum Schenken“, eingeladen „Familie“ vorausgewählt", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, admin: true });
  await page.goto("/#/einstellungen/anfragen");
  const anna = page.locator(".request", { hasText: "anna@test.de" });
  const oma = page.locator(".request", { hasText: "oma@test.de" });
  await expect(anna.getByRole("radio", { name: /Familie/ })).toBeChecked();
  await expect(oma.getByRole("radio", { name: /Zum Schenken/ })).toBeChecked();
  await oma.getByRole("button", { name: "Freigeben" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.action === "decide")).toMatchObject({ id: "req2", approve: true, type: "guest" });
});

test("Konten: Administratorin stellt ein Konto auf „Zum Schenken“ um", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, admin: true });
  await page.goto("/#/einstellungen");
  await page.getByRole("link", { name: /^Konten/ }).click();
  const tobias = page.locator(".account", { hasText: "Tobias" });
  await tobias.getByRole("button", { name: "Zum Schenken" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "set_account_type")).toMatchObject({ p_user: "u-gast", p_type: "guest" });
  await expect(page.locator("#toast")).toContainText("Tobias hat jetzt ein Konto zum Schenken");
});

test("Konto zum Schenken: Wunschlisten kommen aus dem Konto und lassen sich entfernen", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, guestAccount: true, followed: true });
  await page.goto("/#/");
  const section = page.getByRole("region", { name: "Wunschlisten zum Schenken" });
  await expect(section.getByRole("link", { name: /Mias Einschulung/ })).toHaveAttribute("href", "#/w/MIA");
  await section.getByRole("button", { name: "„Mias Einschulung“ aus deiner Übersicht entfernen" }).click();
  await expect.poll(() => calls.writes.find((w) => w.startsWith("DELETE list_followers"))).toContain("list_id=eq.fl1");
  await expect(section.getByRole("link", { name: /Mias Einschulung/ })).toHaveCount(0);
});

test("Familienkonto mit gespeicherter fremder Liste: Bereich unter den eigenen Listen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, followed: true });
  await page.goto("/#/");
  await expect(page.getByRole("region", { name: "Wunschlisten zum Schenken" })).toContainText("Mias Einschulung");
  await expect(page.getByRole("button", { name: "Neue Liste" })).toBeVisible();
});

test("Familienkonto ohne gespeicherte fremde Listen: kein leerer Bereich", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: /Hallo/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Wunschlisten zum Schenken" })).toHaveCount(0);
});

test("Angemeldet als Gast: Liste wird gespeichert, eigene Reservierung kommt vom Konto, Aufheben ohne Code", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, guestAccount: true, accountReservation: true });
  await page.goto("/#/w/TOK");
  await expect(page.getByRole("heading", { name: "Emmas 9. Geburtstag" })).toBeVisible();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "follow_list")).toMatchObject({ p_token: "TOK" });
  const mine = page.getByRole("region", { name: /Deine Geschenke/ });
  await expect(mine).toContainText("Kinderfahrrad");
  await mine.getByRole("button", { name: "Reservierung aufheben" }).click();
  await page.getByRole("button", { name: "Ja, aufheben" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "cancel_my_reservation")).toMatchObject({ p_id: "acc1" });
  expect(calls.bodies.find((b) => b.fn === "cancel_reservation")).toBeUndefined();
});

test("Mitglieder: Schenkende mit Konto sehen, hinzufügen und Hinweis ohne Konto", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}/mitglieder`);
  const panel = page.getByRole("region", { name: "Schenkende mit Konto" });
  await expect(panel).toContainText("Tobias");
  await expect(panel).toContainText("über den Link gespeichert");
  await panel.getByLabel("Konto per E-Mail hinzufügen").fill("oma@test.de");
  await panel.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.locator("#toast")).toContainText("Oma Gisela sieht die Liste jetzt im eigenen Konto.");
  await panel.getByLabel("Konto per E-Mail hinzufügen").fill("neu@test.de");
  await panel.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(panel).toContainText("Zu dieser Adresse gibt es noch kein Konto");
  await panel.getByRole("button", { name: "Tobias entfernen" }).click();
  await expect.poll(() => calls.writes.find((w) => w.startsWith("DELETE list_followers"))).toContain("user_id=eq.u-tobias");
});

test("Freigeben mit Listen: eigene Listen anhaken, bei Einladungen schon vorausgewählt", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true, admin: true });
  await page.goto("/#/einstellungen/anfragen");
  const anna = page.locator(".request", { hasText: "anna@test.de" });
  const oma = page.locator(".request", { hasText: "oma@test.de" });
  // Eingeladen zum Mitbearbeiten: Familie, Liste der Einladung angehakt
  await expect(anna.getByText("Als Mitbearbeiter hinzufügen zu")).toBeVisible();
  await expect(anna.getByRole("checkbox", { name: "Emmas 9. Geburtstag" })).toBeChecked();
  // Ohne Einladung: zum Schenken, nichts vorausgewählt
  await expect(oma.getByText("Diese Wunschlisten zum Schenken freigeben")).toBeVisible();
  const box = oma.getByRole("checkbox", { name: "Emmas 9. Geburtstag" });
  await expect(box).not.toBeChecked();
  await box.check();
  await oma.getByRole("button", { name: "Freigeben" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.action === "decide")).toMatchObject({ id: "req2", type: "guest", lists: [LID] });
});

test("Liste zeigt „Zuletzt“ mit dem neuesten Eintrag und führt zum Verlauf", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(`/#/liste/${LID}`);
  const last = page.getByRole("link", { name: /^Zuletzt:/ });
  await expect(last).toContainText("Oma Gisela hat „Kinderfahrrad 24 Zoll“ reserviert");
  await expect(last).toContainText(/vor \d+ Min\.|gerade eben/);
  await last.click();
  await expect(page.getByRole("heading", { name: "Verlauf", exact: true })).toBeVisible();
});

test("Auf allen Geräten abmelden: mit Rückfrage, beendet alle Anmeldungen", async ({ page }) => {
  const calls = await mockSupabase(page, { signedIn: true });
  await page.goto("/#/einstellungen");
  await page.getByRole("button", { name: "Auf allen Geräten abmelden" }).click();
  const box = page.getByRole("group", { name: "Auf allen Geräten abmelden" });
  await expect(box).toContainText("spätestens nach einer Stunde");
  await box.getByRole("button", { name: "Ja, überall abmelden" }).click();
  await expect.poll(() => calls.bodies.find((b) => b.fn === "logout")).toMatchObject({ scope: "global" });
  await expect(page.getByRole("button", { name: /Anmelde-Mail/ })).toBeVisible();
});

test("Schutz vor Clickjacking: eingebettet zeigt Päckli nur einen Hinweis", async ({ page, baseURL }) => {
  await mockSupabase(page, { signedIn: true });
  await page.setContent(`<h1>Fremde Seite</h1><iframe src="${baseURL}/#/" style="width:400px;height:500px"></iframe>`);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText("Aus Sicherheitsgründen lässt sich Päckli nicht in anderen Seiten anzeigen.")).toBeVisible();
  await expect(frame.getByRole("link", { name: "Päckli direkt öffnen" })).toHaveAttribute("target", "_blank");
  await expect(frame.getByRole("button", { name: "Neue Liste" })).toHaveCount(0);
});

test("Gruppengeschenk ganz übernommen: Eltern sehen, wer es selbst besorgt", async ({ page }) => {
  await mockSupabase(page, { signedIn: true, selfBought: true });
  await page.goto(`/#/liste/${LID}`);
  const row = page.locator(".wrow-btn", { hasText: "Laufrad gemeinsam" });
  await expect(row).toContainText("Tante Sabine übernimmt es ganz und besorgt es selbst");
  await expect(row.locator(".gift-progress")).toHaveCount(0);
  await row.click();
  const panel = page.getByRole("region", { name: "Beiträge zum Gruppengeschenk" });
  await expect(panel).toContainText("übernimmt es ganz und besorgt es selbst");
  await expect(panel.getByRole("button", { name: "Reservierung von Tante Sabine aufheben" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Beitrag eintragen" })).toHaveCount(0);
});

test("Fehlt nach einem Update ein Programmteil, lädt Päckli einmal neu statt eine Fehlermeldung zu zeigen", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  // Die Statistik-Seite ist beim ersten Abruf „weg“ (wie nach einer neuen Version), danach wieder da
  let calls = 0;
  await page.route(/assets\/StatsPage-[^/]+\.js$/, (r) => (calls++ === 0 ? r.fulfill({ status: 404, body: "" }) : r.continue()));
  await page.goto("/#/statistik");
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Da ist etwas schiefgelaufen")).toHaveCount(0);
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => sessionStorage.getItem("paeckli-neu-geladen"))).not.toBeNull();
});

test("Hinweis auf eine neue Version mit „Aktualisieren“", async ({ page }) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto("/#/");
  await expect(page.getByRole("button", { name: "Neue Liste" })).toBeVisible();
  await expect(page.getByText("Neue Version von Päckli verfügbar.")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("paeckli:neue-version")));
  await expect(page.getByText("Neue Version von Päckli verfügbar.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aktualisieren" })).toBeVisible();
});
