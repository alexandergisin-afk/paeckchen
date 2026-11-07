// Päckli – Produktsuche über die offizielle eBay-Schnittstelle (Browse API)
// Liefert Neuware zum Sofortkauf mit Name, Bild, Preis und Link. Nur für angemeldete Eltern:
// Die Funktion prüft die Anmeldung selbst, deshalb muss „Verify JWT“ in Supabase ausgeschaltet sein.
//
// Benötigte Secrets in Supabase (Edge Functions → Secrets):
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET   – aus dem eBay-Entwicklerkonto (Production-Keyset)
//   EBAY_MARKETPLACE (optional)          – EBAY_DE (Standard), EBAY_CH oder EBAY_AT

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export interface Result { title: string; image: string | null; price_cents: number | null; currency: string | null; url: string; shop: string }

const LANG: Record<string, string> = { EBAY_DE: "de-DE", EBAY_AT: "de-AT", EBAY_CH: "de-CH" };

/** eBay-Bilder kommen oft als kleine Vorschau. „s-l225“ → „s-l500“ liefert eine gute Größe. */
export const biggerImage = (u: string | null | undefined) => (u ? u.replace(/s-l\d+\./, "s-l500.") : null);

/** Entfernt Tracking-Parameter: https://www.ebay.de/itm/123?hash=… → https://www.ebay.de/itm/123 */
export function cleanUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`;
  } catch {
    return u;
  }
}

export function toCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Entfernt typische Händler-Füllwörter aus eBay-Titeln („NEU OVP“, „Blitzversand“ …). */
export function cleanTitle(t: string): string {
  return t
    .replace(/\b(neu|new|ovp|neuware|originalverpackt|original verpackt|versiegelt|sealed|blitzversand|versandkostenfrei|sofort lieferbar|top|rar|rarität)\b/gi, " ")
    .replace(/[!*]+/g, " ")
    .replace(/\([\s&+,/|–-]*\)|\[[\s&+,/|–-]*\]/g, " ")
    .replace(/\s*[-–|,/+&]\s*$/g, "")
    .replace(/^\s*[-–|,/+&]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function mapResults(data: Json, limit: number): Result[] {
  const seen = new Set<string>();
  const out: Result[] = [];
  for (const it of (data?.itemSummaries ?? []) as Json[]) {
    const raw = String(it.title ?? "").replace(/\s+/g, " ").trim();
    const title = (cleanTitle(raw) || raw).slice(0, 200);
    const url = typeof it.itemWebUrl === "string" ? cleanUrl(it.itemWebUrl) : "";
    if (!title || !url) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue; // gleiche Angebote mehrerer Händler nur einmal zeigen
    seen.add(key);
    out.push({
      title,
      image: biggerImage(it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl),
      price_cents: toCents(it.price?.value),
      currency: typeof it.price?.currency === "string" ? it.price.currency : null,
      url,
      shop: "eBay",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function isSignedIn(req: Request): Promise<boolean> {
  const base = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("authorization");
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!base || !auth) return false;
  try {
    const r = await fetch(`${base}/auth/v1/user`, { headers: { authorization: auth, apikey } });
    return r.ok;
  } catch {
    return false;
  }
}

// Zugangstoken von eBay (gilt rund 2 Stunden) zwischenspeichern, solange die Funktion warm ist.
let cached: { token: string; until: number } | null = null;
async function ebayToken(api: string, id: string, secret: string): Promise<{ token?: string; status?: number }> {
  if (cached && cached.until > Date.now() + 60_000) return { token: cached.token };
  const res = await fetch(`${api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) {
    console.log("produkt-suche: eBay-Token abgelehnt", res.status, (await res.text()).slice(0, 300));
    return { status: res.status };
  }
  const d = await res.json();
  cached = { token: d.access_token, until: Date.now() + (Number(d.expires_in) || 7200) * 1000 };
  return { token: cached.token };
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!(await isSignedIn(req))) return json({ error: "not_signed_in" }, 401);

    const id = Deno.env.get("EBAY_CLIENT_ID");
    const secret = Deno.env.get("EBAY_CLIENT_SECRET");
    if (!id || !secret) return json({ error: "not_configured" });
    const market = (Deno.env.get("EBAY_MARKETPLACE") ?? "EBAY_DE").toUpperCase();
    const api = Deno.env.get("EBAY_API_BASE") ?? "https://api.ebay.com"; // nur für Tests änderbar

    let q = "";
    let limit = 12;
    try {
      const body = await req.json();
      q = String(body.q ?? "").trim().slice(0, 100);
      limit = Math.max(1, Math.min(24, Number(body.limit) || 12));
    } catch { /* leer */ }
    if (q.length < 2) return json({ error: "query_too_short" }, 400);

    try {
      const t = await ebayToken(api, id, secret);
      if (!t.token) return json({ error: "ebay_auth", status: t.status });
      const params = new URLSearchParams({
        q,
        limit: String(Math.min(50, limit * 2)), // mehr holen, weil doppelte Titel herausfallen
        filter: "buyingOptions:{FIXED_PRICE},conditionIds:{1000}", // Neuware, Sofortkauf
      });
      const res = await fetch(`${api}/buy/browse/v1/item_summary/search?${params}`, {
        headers: { Authorization: `Bearer ${t.token}`, "X-EBAY-C-MARKETPLACE-ID": market, "Accept-Language": LANG[market] ?? "de-DE" },
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.log("produkt-suche: Suche abgelehnt", res.status, detail);
        if (res.status === 401) cached = null;
        return json({ error: "ebay_search", status: res.status });
      }
      return json({ results: mapResults(await res.json(), limit), market });
    } catch (e) {
      console.log("produkt-suche Fehler", String(e));
      return json({ error: "not_reachable" });
    }
  });
}
