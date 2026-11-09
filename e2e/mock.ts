import type { Page, Route } from "@playwright/test";

export const UID = "11111111-1111-1111-1111-111111111111";
export const LID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const WISHES = [
  { id: "w1", list_id: LID, title: "Kinderfahrrad 24 Zoll", url: "https://www.decathlon.de/x", shop: "Decathlon", image_path: null, price_cents: 34900, quantity: 1, priority: "heart", note: "Mintgrün", created_at: "2026-11-02" },
  { id: "w2", list_id: LID, title: "Hörspielfiguren für die Toniebox", url: null, shop: "tonies", image_path: null, price_cents: 1699, quantity: 3, priority: "nice", note: null, created_at: "2026-11-03" },
  { id: "w3", list_id: LID, title: "Schwimmbrille", url: null, shop: null, image_path: null, price_cents: 1299, quantity: 1, priority: "small", note: null, created_at: "2026-11-04" },
];
const RES = [
  { id: "r1", wish_id: "w2", quantity: 1, guest_name: "Familie Yilmaz", created_at: "2026-11-20T10:00:00Z" },
  { id: "r2", wish_id: "w3", quantity: 1, guest_name: "Oma Gisela", created_at: "2026-11-21T10:00:00Z" },
];
const LIST = {
  id: LID, title: "Emmas 9. Geburtstag", description: "Basteln und Lesen", recipient_name: "Emma", occasion: "birthday",
  event_date: "2026-12-14", cover: 0, guest_token: "TOK", created_at: "2026-11-01", archived_at: null,
  list_members: [{ user_id: UID, role: "owner", show_reservations: true }],
};

export interface Calls { lists: string[]; rpc: string[]; writes: string[]; bodies: Record<string, unknown>[] }

/** Beantwortet alle Supabase-Anfragen mit Testdaten und protokolliert sie. */
export async function mockSupabase(page: Page, opts: { signedIn?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { lists: [], rpc: [], writes: [], bodies: [] };
  if (opts.signedIn) {
    const session = {
      access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: UID, email: "julia@test.de", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" },
    };
    await page.addInitScript((s) => localStorage.setItem("sb-e2e-auth-token", s), JSON.stringify(session));
  }
  await page.route("https://e2e.supabase.co/**", async (route: Route) => {
    const req = route.request();
    const url = decodeURIComponent(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/functions/v1/produkt-suche")) {
      calls.rpc.push("produkt-suche");
      return json({ market: "EBAY_DE", results: Array.from({ length: 25 }, (_, i) => ({
        title: i === 0 ? "LEGO Friends 42652 Freundschaftsbaumhaus" : `Baumhaus Spielset Nr. ${i + 1}`,
        image: null, price_cents: 7999 - i * 100, currency: "EUR", url: `https://www.ebay.de/itm/${1000 + i}`, shop: "eBay",
      })) });
    }
    if (url.includes("/functions/v1/link-vorschau")) {
      calls.rpc.push("link-vorschau");
      return json({ title: "Hörbuch-Box für Kinder ab 8", image: null, price_cents: 1499, shop: "Thalia" });
    }
    if (url.includes("/rpc/")) {
      const fn = url.split("/rpc/")[1].split("?")[0];
      calls.rpc.push(fn);
      try { calls.bodies.push({ fn, ...JSON.parse(req.postData() ?? "{}") }); } catch { /* egal */ }
      if (fn === "reserve_for_guest") return json({ ok: true, code: "WXYZ-2345" });
      if (fn === "guest_list") {
        const avail: Record<string, number> = { w1: 1, w2: 2, w3: 0 };
        return json({ ...LIST, wishes: WISHES.map(({ list_id: _l, created_at: _c, ...w }) => ({ ...w, available: avail[w.id] })) });
      }
      if (fn === "my_reservations") return json([]);
      if (fn === "reserve_wish") return json({ ok: true, code: "ABCD-2345" });
      return json(null);
    }
    if (req.method() !== "GET") { calls.writes.push(`${req.method()} ${url.split("/rest/v1/")[1] ?? url} ${req.postData() ?? ""}`); return route.fulfill({ status: 204 }); }
    if (url.includes("/rest/v1/profiles")) return json({ display_name: "Julia", reminder_emails: true, notify_reservations: "daily" });
    if (url.includes("/rest/v1/lists")) {
      calls.lists.push(url);
      const nested = { ...LIST, wishes: WISHES.map((w) => ({ ...w, reservations: RES.filter((r) => r.wish_id === w.id) })) };
      if (url.includes("id=eq.")) return json(req.headers()["accept"]?.includes("object") ? nested : [nested]);
      if (url.includes("list_members(user_id,show_reservations)")) return json([{ ...LIST, list_members: [{ user_id: UID, show_reservations: true }] }]);
      return json([{ ...LIST, wishes: WISHES.map((w) => ({ id: w.id, quantity: w.quantity, reservations: RES.filter((r) => r.wish_id === w.id).map((r) => ({ quantity: r.quantity })) })) }]);
    }
    if (url.includes("/rest/v1/wishes")) return json(WISHES);
    if (url.includes("/rest/v1/reservations")) return json(RES);
    return json([]);
  });
  return calls;
}

/** Sammelt Verstöße gegen die Sicherheitsregeln (CSP), Abstürze und Anfragen an fremde Server. */
export function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) problems.push(`CSP: ${m.text().slice(0, 120)}`); });
  page.on("pageerror", (e) => problems.push(`Absturz: ${e.message}`));
  page.on("request", (r) => {
    const u = r.url();
    if (!/^(http:\/\/localhost|https:\/\/e2e\.supabase\.co|data:|blob:)/.test(u)) problems.push(`Fremder Server: ${u}`);
  });
  return problems;
}
