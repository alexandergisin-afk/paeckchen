import { db } from "./supabase";

export const BUCKET = "wish-images";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const formatPrice = (cents: number | null) => (cents == null ? "" : EUR.format(cents / 100));

/** Versteht „12,99“, „12.99“, „1.299,00 €“ und „15“. Leere Eingabe ergibt null. */
export function parsePrice(input: string): number | null {
  let v = input.replace(/[€\s]/g, "");
  if (!v) return null;
  v = v.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const priceInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Bild-Adresse: eigener Upload (Pfad im Speicher) oder später eine Shop-Adresse. */
export function imageUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Verkleinert ein Foto auf max. 1200 px und speichert es als JPEG (schont Speicher und Datenvolumen). */
export async function resizeImage(file: File, max = 1200): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Bild nicht lesbar"));
      i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * s);
    canvas.height = Math.round(img.height * s);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparente PNGs bekommen einen weißen statt schwarzen Hintergrund
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Bild nicht lesbar"))), "image/jpeg", 0.82),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(listId: string, blob: Blob): Promise<string> {
  const path = `${listId}/${crypto.randomUUID()}.jpg`;
  const { error } = await db().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/** Löscht ein hochgeladenes Bild. Fehler sind hier unkritisch (höchstens eine verwaiste Datei). */
export async function removeImage(path: string | null) {
  if (!path || /^https?:\/\//.test(path)) return;
  await db().storage.from(BUCKET).remove([path]);
}

const EMOJI: [string, string][] = [
  ["fahrrad", "🚲"], ["helm", "⛑️"], ["lego", "🧱"], ["buch", "📚"], ["hörspiel", "🎧"], ["hörbuch", "🎧"],
  ["tonie", "🎧"], ["kopfhörer", "🎧"], ["puzzle", "🧩"], ["spiel", "🎲"], ["puppe", "🪆"], ["feuerwehr", "🚒"],
  ["auto", "🚗"], ["zug", "🚂"], ["bahn", "🚂"], ["dino", "🦕"], ["ball", "⚽"], ["schuh", "👟"], ["stiefel", "🥾"],
  ["jacke", "🧥"], ["mal", "🎨"], ["stift", "✏️"], ["bastel", "✂️"], ["musik", "🎵"], ["gutschein", "🎟️"],
  ["karte", "🎟️"], ["kuschel", "🧸"], ["plüsch", "🧸"], ["uhr", "⌚"], ["zelt", "⛺"], ["werk", "🔨"],
  ["schlittschuh", "⛸️"], ["schwimm", "🥽"], ["zoo", "🦒"], ["kletter", "🧗"],
];
export function guessEmoji(title: string): string {
  const t = title.toLowerCase();
  return EMOJI.find(([k]) => t.includes(k))?.[1] ?? "🎁";
}

/** Gleichbleibende Pastellfarbe pro Wunsch, abgeleitet aus der ID. */
export function tintFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

const SHOPS: Record<string, string> = {
  amazon: "Amazon", otto: "OTTO", thalia: "Thalia", decathlon: "Decathlon", lego: "LEGO", "jako-o": "JAKO-O",
  mytoys: "myToys", ikea: "IKEA", zalando: "Zalando", tonies: "tonies", smythstoys: "Smyths Toys", mueller: "Müller",
  galeria: "Galeria", hugendubel: "Hugendubel", tchibo: "Tchibo", ebay: "eBay", etsy: "Etsy",
  kleinanzeigen: "Kleinanzeigen", playmobil: "PLAYMOBIL", dm: "dm", rossmann: "Rossmann", mediamarkt: "MediaMarkt",
  saturn: "Saturn", idealo: "idealo", google: "Google Shopping",
};

/** Liest Shop und, falls möglich, den Produktnamen aus der Link-Adresse. Ohne Serverabruf. */
export function detectFromUrl(raw: string): { url: string; shop: string; title: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, "").split(".");
  const base = host.length > 1 ? host[host.length - 2] : host[0];
  const shop = SHOPS[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
  let title = "";
  const q = ["q", "k", "sq", "Ntt", "query", "search"].map((k) => u.searchParams.get(k)).find(Boolean);
  if (q) title = q;
  else {
    const seg = u.pathname
      .split("/")
      .filter((s) => /[a-zäöü]/i.test(s) && s.includes("-"))
      .sort((a, b) => b.length - a.length)[0];
    if (seg) {
      try {
        title = decodeURIComponent(seg);
      } catch {
        title = seg;
      }
      title = title.replace(/\.(html?|php)$/, "").replace(/[-_]+/g, " ").replace(/\b\d{5,}\b/g, "").replace(/\s+/g, " ").trim();
    }
  }
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
  return { url: u.href, shop, title: title.slice(0, 200) };
}

export const SEARCH_SHOPS: { name: string; url: (q: string) => string }[] = [
  { name: "Amazon", url: (q) => `https://www.amazon.de/s?k=${q}` },
  { name: "Thalia", url: (q) => `https://www.thalia.de/suche?sq=${q}` },
  { name: "OTTO", url: (q) => `https://www.otto.de/suche/${q}/` },
  { name: "Decathlon", url: (q) => `https://www.decathlon.de/search?Ntt=${q}` },
  { name: "LEGO", url: (q) => `https://www.lego.com/de-de/search?q=${q}` },
  { name: "IKEA", url: (q) => `https://www.ikea.com/de/de/search/?q=${q}` },
  { name: "Google Shopping", url: (q) => `https://www.google.com/search?tbm=shop&q=${q}` },
];
