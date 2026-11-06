export type Occasion = "birthday" | "christmas" | "other";
export type Role = "owner" | "editor";

export interface WishList {
  id: string;
  title: string;
  description: string | null;
  recipient_name: string | null;
  occasion: Occasion;
  event_date: string | null;
  cover: number;
  guest_token: string;
  created_at: string;
  wishes?: { count: number }[];
  list_members?: { user_id: string; role: Role; show_reservations: boolean }[];
}

export const LIST_SELECT =
  "id,title,description,recipient_name,occasion,event_date,cover,guest_token,created_at,wishes(count),list_members(user_id,role,show_reservations)";

export const OCCASIONS: Record<Occasion, string> = {
  birthday: "Geburtstag",
  christmas: "Weihnachten",
  other: "Anderer Anlass",
};

export const COVERS = [
  { e: "🎂", t: 0 }, { e: "🎄", t: 2 }, { e: "🏡", t: 4 },
  { e: "🎈", t: 1 }, { e: "⭐", t: 3 }, { e: "🎁", t: 5 },
];

export const cover = (i: number) => COVERS[i] ?? COVERS[5];

export type Priority = "heart" | "nice" | "small";

export interface Wish {
  id: string;
  list_id: string;
  title: string;
  url: string | null;
  shop: string | null;
  image_path: string | null;
  price_cents: number | null;
  quantity: number;
  priority: Priority;
  note: string | null;
  created_at: string;
}

export const PRIORITIES: Record<Priority, { label: string; icon: string; cls: string }> = {
  heart: { label: "Herzenswunsch", icon: "♥", cls: "p-herz" },
  nice: { label: "Wäre schön", icon: "✦", cls: "p-schoen" },
  small: { label: "Kleine Aufmerksamkeit", icon: "•", cls: "p-klein" },
};

const PRIO_ORDER: Record<Priority, number> = { heart: 0, nice: 1, small: 2 };

/** Herzenswünsche zuerst, innerhalb einer Stufe in der Reihenfolge des Hinzufügens. */
export const sortWishes = (ws: Wish[]) =>
  [...ws].sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || a.created_at.localeCompare(b.created_at));

export interface Reservation {
  id: string;
  wish_id: string;
  quantity: number;
  guest_name: string;
  created_at: string;
}

/** Was Gäste über eine Liste erfahren: keine Namen, nur freie Mengen. */
export interface GuestWish {
  id: string;
  title: string;
  url: string | null;
  shop: string | null;
  image_path: string | null;
  price_cents: number | null;
  quantity: number;
  priority: Priority;
  note: string | null;
  available: number;
}

export interface GuestList {
  id: string;
  title: string;
  recipient_name: string | null;
  occasion: Occasion;
  event_date: string | null;
  description: string | null;
  cover: number;
  wishes: GuestWish[];
}
