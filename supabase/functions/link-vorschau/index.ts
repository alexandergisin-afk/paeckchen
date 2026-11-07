// Päckchen – Link-Vorschau
// Liest aus einer Shop-Seite Name, Bild und Preis, so wie WhatsApp es für Link-Vorschauen tut
// (Open-Graph-Angaben und strukturierte Produktdaten). Nur für angemeldete Eltern.
// Viele Shops liefern diese Daten gern aus, manche (z. B. Amazon) blockieren solche Abrufe oft.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface Preview { title: string | null; image: string | null; price_cents: number | null; shop: string | null }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß" };
export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Liest <meta property|name|itemprop="key" content="…"> in beliebiger Attribut-Reihenfolge. */
export function meta(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !keys.includes(key)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content && content.trim()) return decode(content);
  }
  return null;
}

/** Wandelt „1.299,00“, „1299.00“, „19,95 €“ oder 19.95 in Cent um. */
export function toCents(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (/\.\d{3}$/.test(s) && s.split(".").length > 1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

type Json = Record<string, unknown>;
function findProduct(node: unknown): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) { const p = findProduct(n); if (p) return p; }
    return null;
  }
  const o = node as Json;
  const t = o["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return o;
  for (const k of ["@graph", "mainEntity", "itemListElement"]) { const p = findProduct(o[k]); if (p) return p; }
  return null;
}
function firstImage(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (v && typeof v === "object") return firstImage((v as Json).url ?? (v as Json).contentUrl);
  return null;
}
function offerPrice(v: unknown): number | null {
  if (Array.isArray(v)) { for (const o of v) { const p = offerPrice(o); if (p != null) return p; } return null; }
  if (!v || typeof v !== "object") return null;
  const o = v as Json;
  return toCents(o.price ?? o.lowPrice ?? (o.priceSpecification as Json | undefined)?.price);
}

export function parse(html: string, pageUrl: string): Preview {
  let title: string | null = null, image: string | null = null, price: number | null = null, shop: string | null = null;

  // 1. Strukturierte Produktdaten (JSON-LD) – am zuverlässigsten für den Preis
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const p = findProduct(JSON.parse(m[1].trim()));
      if (p) {
        if (typeof p.name === "string") title ??= decode(p.name);
        image ??= firstImage(p.image);
        price ??= offerPrice(p.offers);
      }
    } catch { /* fehlerhaftes JSON-LD ignorieren */ }
  }

  // 2. Open Graph und ähnliche Angaben
  title ??= meta(html, ["og:title", "twitter:title"]);
  image ??= meta(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image"]);
  price ??= toCents(meta(html, ["product:price:amount", "og:price:amount", "price"]));
  shop = meta(html, ["og:site_name", "application-name"]);

  // 3. Notfalls der Seitentitel
  if (!title) {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    if (t) title = decode(t);
  }
  if (title) {
    // „Produkt | Shop“ → „Produkt“
    title = title.replace(/\s+[|–—]\s+[^|–—]{2,40}$/, "").trim().slice(0, 200) || null;
  }
  if (image) {
    try { image = new URL(decode(image), pageUrl).href; } catch { image = null; }
    if (image && !/^https:\/\//.test(image)) image = image.replace(/^http:\/\//, "https://");
  }
  return { title, image, price_cents: price, shop: shop ? shop.slice(0, 60) : null };
}

/** Keine Abrufe ins interne Netz. */
export function allowedUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
  }
  if (h.startsWith("[") || h.includes(":")) return null; // IPv6-Adressen direkt nicht erlaubt
  return u;
}

async function readLimited(res: Response, max = 1_500_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { all.set(c.subarray(0, Math.min(c.length, size - o)), o); o += c.length; if (o >= size) break; }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let url: URL | null = null;
    try { url = allowedUrl(String((await req.json()).url ?? "")); } catch { /* leer */ }
    if (!url) return json({ error: "invalid_url" }, 400);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url.href, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Paeckchen-Linkvorschau/1.0; +https://github.com)",
          "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
        },
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return json({ error: "not_readable", status: res.status });
      const finalUrl = allowedUrl(res.url) ? res.url : url.href;
      return json(parse(await readLimited(res), finalUrl));
    } catch {
      return json({ error: "not_readable" });
    } finally {
      clearTimeout(timer);
    }
  });
}
