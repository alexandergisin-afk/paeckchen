import { db } from "./supabase";
import { detectFromUrl } from "./wishes";

/** Was über einen Wunsch schon bekannt ist, bevor das Detail-Formular öffnet. */
export interface Draft {
  title: string;
  url: string | null;
  shop: string | null;
  price_cents: number | null;
  image: string | null;
  source: "search" | "link" | "manual";
}

/**
 * Liest einen Shop-Link aus: sofort Shop und Name aus der Adresse, dann (falls der Shop es zulässt)
 * Name, Bild und Preis von der Shopseite über die Supabase-Funktion „link-vorschau“.
 * Liefert immer einen Entwurf und eine verständliche Meldung, nie einen Fehler.
 */
export async function readLink(raw: string): Promise<{ draft: Draft | null; message: string; found: boolean }> {
  const d = detectFromUrl(raw);
  if (!d) return { draft: null, message: "Das sieht noch nicht nach einem vollständigen Link aus.", found: false };
  const draft: Draft = { title: d.title, url: d.url, shop: d.shop, price_cents: null, image: null, source: "link" };
  let p: { title?: string | null; image?: string | null; price_cents?: number | null; shop?: string | null; error?: string; status?: number } | null = null;
  let unreachable = "";
  try {
    const { data, error } = await db().functions.invoke("link-vorschau", { body: { url: d.url } });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      unreachable = status === 401 ? "Anmeldung abgelehnt, Code 401" : status === 404 ? "Funktion nicht gefunden, Code 404" : status ? `Code ${status}` : "keine Verbindung";
    } else p = data;
  } catch {
    unreachable = "keine Verbindung";
  }
  if (p && !p.error && (p.title || p.image || p.price_cents != null)) {
    if (p.title) draft.title = p.title;
    if (p.image) draft.image = p.image;
    if (p.price_cents != null) draft.price_cents = p.price_cents;
    if (p.shop && p.shop.length <= 30) draft.shop = p.shop;
    return { draft, message: "Gefunden. Prüf kurz die Angaben.", found: true };
  }
  const reason = unreachable
    ? `Die automatische Erkennung ist gerade nicht erreichbar (${unreachable}).`
    : p?.error === "blocked"
      ? `${d.shop} lässt das automatische Auslesen nicht zu${p.status && p.status !== 200 ? ` (${p.status})` : ""}.`
      : `${d.shop} gibt keine Produktdaten heraus.`;
  return { draft, message: `${reason} ${d.title ? "Den Namen haben wir aus dem Link übernommen." : "Trag den Namen bitte selbst ein."}`, found: false };
}
