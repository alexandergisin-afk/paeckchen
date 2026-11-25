import type { Page, Route } from "@playwright/test";

export const UID = "11111111-1111-1111-1111-111111111111";
export const LID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const WISHES = [
  { id: "w1", list_id: LID, title: "Kinderfahrrad 24 Zoll", url: "https://www.decathlon.de/x", shop: "Decathlon", image_path: null, price_cents: 34900, quantity: 1, priority: "heart", note: "Mintgrün", created_at: "2026-11-02" },
  { id: "w2", list_id: LID, title: "Hörspielfiguren für die Toniebox", url: null, shop: "tonies", image_path: null, price_cents: 1699, quantity: 3, priority: "nice", note: null, created_at: "2026-11-03" },
  { id: "w4", list_id: LID, title: "Laufrad gemeinsam", url: null, shop: null, image_path: null, price_cents: 30000, quantity: 1, priority: "heart", note: null, created_at: "2026-11-05", group_gift: true },
  { id: "w3", list_id: LID, title: "Schwimmbrille", url: null, shop: null, image_path: null, price_cents: 1299, quantity: 1, priority: "small", note: null, created_at: "2026-11-04" },
];
const RES = [
  { id: "r1", wish_id: "w2", quantity: 1, guest_name: "Familie Yilmaz", created_at: "2026-11-20T10:00:00Z" },
  { id: "r2", wish_id: "w3", quantity: 1, guest_name: "Oma Gisela", created_at: "2026-11-21T10:00:00Z" },
  { id: "r3", wish_id: "w4", quantity: 0, amount_cents: 10000, guest_name: "Onkel Tobias", created_at: "2026-11-22T10:00:00Z" },
];
const LIST = {
  id: LID, title: "Emmas 9. Geburtstag", description: "Basteln und Lesen", recipient_name: "Emma", occasion: "birthday",
  event_date: "2026-12-14", cover: 0, guest_token: "TOK", created_at: "2026-11-01", archived_at: null,
  list_members: [{ user_id: UID, role: "owner", show_reservations: true }],
};

export const LID2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LIST2 = {
  id: LID2, title: "Leons Weihnachten", description: null, recipient_name: "Leon", occasion: "christmas",
  event_date: "2026-12-24", cover: 1, guest_token: "TOK2", created_at: "2026-11-05", archived_at: null,
  list_members: [{ user_id: UID, role: "owner", show_reservations: true, sort_order: null }],
};

export interface Calls { lists: string[]; rpc: string[]; writes: string[]; bodies: Record<string, unknown>[] }

/** Beantwortet alle Supabase-Anfragen mit Testdaten und protokolliert sie. */
export async function mockSupabase(page: Page, opts: { signedIn?: boolean; allowParentsBuy?: boolean; slowListMs?: number; recent?: string[]; admin?: boolean; loginBlocked?: boolean; invitePending?: boolean; emptyList?: boolean; guestAccount?: boolean; followed?: boolean; accountReservation?: boolean; selfBought?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { lists: [], rpc: [], writes: [], bodies: [] };
  const order = new Map<string, number>(); // gespeicherte Reihenfolge wie in der echten Datenbank
  const withOrder = <T extends { id: string; list_members: object[] }>(l: T): T =>
    ({ ...l, list_members: l.list_members.map((m) => ({ ...m, sort_order: order.get(l.id) ?? null })) });
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
    if (url.includes("/auth/v1/logout")) {
      calls.bodies.push({ fn: "logout", scope: new URL(req.url()).searchParams.get("scope") ?? "local" });
      return route.fulfill({ status: 204 });
    }
    if (url.includes("/auth/v1/otp") && opts.loginBlocked) {
      return json({ code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" }, 500);
    }
    if (url.includes("/functions/v1/zugang")) {
      const b = JSON.parse(req.postData() ?? "{}");
      calls.bodies.push({ fn: "zugang", ...b });
      if (b.action === "request") return json({ status: "pending" });
      if (b.action === "invite") return json({ status: opts.invitePending ? "pending" : "allowed" });
      if (b.action === "decide") return json({ ok: true, email: "anna@test.de", mail_sent: true });
    }
    if (url.includes("/rest/v1/audit_log")) {
      const now = Date.now();
      const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
      if (url.includes("kind=eq.access")) {
        return json([{ id: 9, at: at(30), kind: "access", action: "approved", actor_name: "Julia", data: { email: "anna@test.de" } }]);
      }
      return json([
        { id: 4, at: at(5), kind: "reservation", action: "reserved", actor_name: "Oma Gisela", data: { wish: "Kinderfahrrad 24 Zoll", guest: "Oma Gisela", quantity: 1, parents_buy: true } },
        { id: 3, at: at(20), kind: "wish", action: "updated", actor_name: "Julia", data: { title: "Kinderfahrrad 24 Zoll", changes: { price_cents: { alt: 34900, neu: 32900 } } } },
        { id: 2, at: at(60 * 26), kind: "member", action: "joined", actor_name: "Markus", data: { member: "Markus" } },
        { id: 1, at: at(60 * 27), kind: "list", action: "created", actor_name: "Julia", data: { title: "Emmas 9. Geburtstag" } },
      ]);
    }
    if (url.includes("/rest/v1/list_followers")) { calls.writes.push(`${req.method()} list_followers ${url.split("?")[1] ?? ""}`); return route.fulfill({ status: 204 }); }
    if (url.includes("/rest/v1/list_members")) {
      // Konten zum Schenken sind nirgends Mitglied; einzelne Abfrage (maybeSingle) bekommt ein Objekt oder null
      const rows = opts.guestAccount ? [] : [{ list_id: LID, user_id: UID, role: "owner", profiles: { display_name: "Julia" } }];
      return (req.headers()["accept"] ?? "").includes("vnd.pgrst.object") ? json(rows[0] ?? null) : json(rows);
    }
    if (url.includes("/rest/v1/app_admins")) return json(opts.admin ? { user_id: UID } : null);
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
      if (fn === "create_list") return json({ ...LIST, id: LID });
      if (fn === "pending_access_requests") return json([
        { id: "req1", email: "anna@test.de", created_at: "2026-11-09T10:00:00Z", invited_by_name: "Markus", list_title: "Emmas 9. Geburtstag", list_id: LID },
        { id: "req2", email: "oma@test.de", created_at: "2026-11-10T10:00:00Z", invited_by_name: null, list_title: null },
      ]);
      if (fn === "list_accounts") return json([
        { id: UID, display_name: "Julia", email: "julia@test.de", account_type: "family", is_admin: true, lists_owned: 2 },
        { id: "u-gast", display_name: "Tobias", email: "tobias@test.de", account_type: "family", is_admin: false, lists_owned: 0 },
      ]);
      if (fn === "set_account_type") return route.fulfill({ status: 204 });
      if (fn === "follow_list") return json(LID);
      if (fn === "claim_reservations") return json(0);
      if (fn === "my_followed_lists") return json(opts.followed
        ? [{ list_id: "fl1", title: "Mias Einschulung", recipient_name: "Mia", event_date: "2027-08-20", cover: 3, guest_token: "MIA" }] : []);
      if (fn === "my_account_reservations") return json(opts.accountReservation ? [{ id: "acc1", wish_id: "w1", quantity: 1, amount_cents: null }] : []);
      if (fn === "cancel_my_reservation") return json(true);
      if (fn === "list_followers_of") return json([{ user_id: "u-tobias", display_name: "Tobias", source: "link", created_at: "2026-11-20T10:00:00Z" }]);
      if (fn === "add_follower") {
        const email = String(JSON.parse(req.postData() ?? "{}").p_email ?? "");
        return json(email.startsWith("oma") ? { status: "added", name: "Oma Gisela" } : { status: "no_account" });
      }
      if (fn === "create_invite") return json("EINLADUNG123");
      if (fn === "set_list_order") {
        const ids = (JSON.parse(req.postData() ?? "{}").p_ids ?? []) as string[];
        ids.forEach((id, i) => order.set(id, i + 1));
        return route.fulfill({ status: 204 });
      }
      if (fn === "contribute" || fn === "contribute_for_guest") {
        // Laufrad: 300 € Ziel, 100 € schon zugesagt → offen bleibt 200 € minus Beitrag
        const amount = Number(JSON.parse(req.postData() ?? "{}").p_amount_cents ?? 0);
        return json({ ok: true, code: "GIFT-2345", open_cents: Math.max(0, 20000 - amount) });
      }
      if (fn === "guest_list") {
        const avail: Record<string, number> = { w1: 1, w2: 2, w3: 0, w4: 1 };
        return json({ ...LIST, allow_parents_buy: opts.allowParentsBuy ?? false, wishes: WISHES.map(({ list_id: _l, created_at: _c, ...w }) => ({
          ...w, available: avail[w.id],
          ...(w.id === "w4" ? { target_cents: 30000, funded_cents: 10000, contributors: 1 } : {}),
        })) });
      }
      if (fn === "my_reservations") return json([]);
      if (fn === "reserve_wish") return json({ ok: true, code: "ABCD-2345" });
      return json(null);
    }
    if (req.method() !== "GET") { calls.writes.push(`${req.method()} ${url.split("/rest/v1/")[1] ?? url} ${req.postData() ?? ""}`); return route.fulfill({ status: 204 }); }
    if (url.includes("/rest/v1/recent_searches")) {
      const row = { user_id: UID, terms: opts.recent ?? [] };
      return json(req.headers()["accept"]?.includes("object") ? row : [row]);
    }
    if (url.includes("/rest/v1/profiles")) return json({ display_name: "Julia", reminder_emails: true, notify_reservations: "daily", list_sort: "custom", account_type: opts.guestAccount ? "guest" : "family" });
    if (url.includes("/rest/v1/lists")) {
      calls.lists.push(url);
      // selfBought: Das Gruppengeschenk „Laufrad“ hat jemand ganz übernommen (Reservierung ohne Betrag)
      const res = opts.selfBought ? RES.map((r) => (r.id === "r3" ? { ...r, quantity: 1, amount_cents: null, guest_name: "Tante Sabine" } : r)) : RES;
      const nested = { ...LIST, wishes: opts.emptyList ? [] : WISHES.map((w) => ({ ...w, reservations: res.filter((r) => r.wish_id === w.id) })) };
      if (url.includes("id=eq.")) {
        if (opts.slowListMs) await new Promise((r) => setTimeout(r, opts.slowListMs));
        return json(req.headers()["accept"]?.includes("object") ? nested : [nested]);
      }
      if (url.includes("list_members(user_id,show_reservations)")) return json([{ ...LIST, list_members: [{ user_id: UID, show_reservations: true }] }]);
      return json([
        { ...withOrder(LIST), wishes: WISHES.map((w) => ({ id: w.id, quantity: w.quantity, price_cents: w.price_cents, group_gift: !!w.group_gift, reservations: RES.filter((r) => r.wish_id === w.id).map((r) => ({ quantity: r.quantity, amount_cents: r.amount_cents ?? null })) })) },
        { ...withOrder(LIST2), wishes: [] },
      ]);
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
