/**
 * Gruppengeschenke: Ein Beitrag ist eine Reservierung mit Betrag (Stückzahl 0).
 * Ein Gruppengeschenk gilt als vergeben, sobald die Beiträge den Preis × Menge erreichen.
 */
interface WishLike { group_gift?: boolean | null; price_cents: number | null; quantity: number }
interface ResLike { quantity: number; amount_cents?: number | null }

export const isGroupGift = (w: WishLike) => !!w.group_gift && w.price_cents != null;
export const giftTarget = (w: WishLike) => (w.price_cents ?? 0) * w.quantity;
export const giftFunded = (rs: ResLike[]) => rs.reduce((a, r) => a + (r.amount_cents ?? 0), 0);

/** Wie viele Stück eines Wunsches als vergeben zählen. */
export function takenQuantity(w: WishLike, rs: ResLike[]): number {
  if (isGroupGift(w)) return giftFunded(rs) >= giftTarget(w) ? w.quantity : 0;
  return Math.min(w.quantity, rs.reduce((a, r) => a + r.quantity, 0));
}

/** Zugesagter Geldwert: bei Gruppengeschenken die Beiträge, sonst Preis × reservierte Stück. */
export function reservedValue(w: WishLike, rs: ResLike[]): number {
  if (isGroupGift(w)) return Math.min(giftFunded(rs), giftTarget(w));
  return (w.price_cents ?? 0) * takenQuantity(w, rs);
}

/** „50 €“ statt „50,00 €“, wenn glatt. */
export function euroShort(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} €` : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}
