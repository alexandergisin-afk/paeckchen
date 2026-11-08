import { db } from "./supabase";
import { BUCKET } from "./wishes";
import type { Wish } from "./types";

const isStoragePath = (p: string | null): p is string => !!p && !/^https?:\/\//.test(p);

/** Kopiert ein hochgeladenes Bild in den Ordner einer anderen Liste (Shop-Bilder sind nur Adressen). */
async function copyImage(path: string | null, targetList: string): Promise<string | null> {
  if (!isStoragePath(path)) return path;
  const to = `${targetList}/${crypto.randomUUID()}.jpg`;
  const { error } = await db().storage.from(BUCKET).copy(path, to);
  return error ? null : to;
}

/** Legt Kopien der Wünsche in einer anderen Liste an (ohne Reservierungen). */
export async function copyWishes(wishes: (Wish & { copyQuantity?: number })[], targetList: string, userId: string) {
  for (const w of wishes) {
    const image_path = await copyImage(w.image_path, targetList);
    const { error } = await db().from("wishes").insert({
      list_id: targetList, title: w.title, url: w.url, shop: w.shop, image_path,
      price_cents: w.price_cents, quantity: w.copyQuantity ?? w.quantity, priority: w.priority, note: w.note, created_by: userId,
    });
    if (error) throw error;
  }
}

/** Verschiebt einen Wunsch samt Bild. Reservierte Wünsche lehnt die Datenbank ab. */
export async function moveWish(w: Wish, targetList: string) {
  const { error } = await db().from("wishes").update({ list_id: targetList }).eq("id", w.id);
  if (error) throw error;
  if (isStoragePath(w.image_path)) {
    const to = `${targetList}/${w.image_path.split("/").pop()}`;
    const { error: mErr } = await db().storage.from(BUCKET).move(w.image_path, to);
    if (!mErr) await db().from("wishes").update({ image_path: to }).eq("id", w.id);
  }
}
