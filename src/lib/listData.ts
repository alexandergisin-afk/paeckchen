import { db } from "./supabase";
import { cached, load } from "./cache";
import { LIST_PAGE_SELECT, sortWishes, type Reservation, type Wish, type WishList } from "./types";

export interface ListPageData { list: WishList; wishes: Wish[]; reservations: Reservation[] }

/** Liste, Wünsche und (falls sichtbar) Reservierungen in einer Abfrage. null = nicht gefunden. */
async function fetchListPage(id: string): Promise<ListPageData | null> {
  const { data, error } = await db().from("lists").select(LIST_PAGE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as Omit<WishList, "wishes"> & { wishes: (Wish & { reservations?: Reservation[] })[] };
  const wishes: Wish[] = (raw.wishes ?? []).map(({ reservations: _r, ...w }) => w as Wish);
  const reservations: Reservation[] = (raw.wishes ?? []).flatMap((w) => (Array.isArray(w.reservations) ? w.reservations : []));
  return { list: { ...raw, wishes: undefined } as WishList, wishes: sortWishes(wishes), reservations };
}

export const listKey = (id: string) => `list:${id}`;
export const loadListPage = (id: string) => load(listKey(id), () => fetchListPage(id));
export const cachedListPage = (id: string) => cached<ListPageData | null>(listKey(id));
