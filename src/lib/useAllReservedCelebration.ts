import { useEffect } from "react";
import { takenQuantity } from "./gift";
import { celebrateOnce } from "./celebrate";
import { toast } from "./format";
import { KEYS } from "./storage";
import type { Reservation, Wish, WishList } from "./types";

/**
 * Freudenmoment: Ist eine Liste zum ersten Mal komplett vergeben, gibt es einmal Konfetti
 * (pro Liste und Gerät), aber nur, wenn man sich die Reservierungen anzeigen lässt.
 * list ist null, solange die Liste noch nicht geladen ist.
 */
export function useAllReservedCelebration(list: WishList | null, userId: string | undefined, wishes: Wish[], reservations: Reservation[]) {
  useEffect(() => {
    const visible = list?.list_members?.find((m) => m.user_id === userId)?.show_reservations ?? true;
    if (!list || !visible || !wishes.length) return;
    const total = wishes.reduce((a, w) => a + w.quantity, 0);
    const taken = wishes.reduce((a, w) => a + takenQuantity(w, reservations.filter((r) => r.wish_id === w.id)), 0);
    if (total > 0 && taken >= total && celebrateOnce(KEYS.allReserved(list.id))) toast("Alles vergeben! 🎉");
  }, [list, userId, wishes, reservations]);
}
