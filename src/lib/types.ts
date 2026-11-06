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
  list_members?: { user_id: string; role: Role }[];
}

export const LIST_SELECT =
  "id,title,description,recipient_name,occasion,event_date,cover,guest_token,created_at,wishes(count),list_members(user_id,role)";

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
