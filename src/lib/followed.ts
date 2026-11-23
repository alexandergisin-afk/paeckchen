import { db } from "./supabase";
import { cached, load, remember } from "./cache";
import { getCodes } from "./device";
import { getGuestLists, forgetGuestList } from "./guestLists";
import { hasFlag, KEYS, setFlag } from "./storage";

/** Am Konto gespeicherte Wunschlisten (zum Schenken). */
export interface FollowedList {
  list_id: string;
  title: string;
  recipient_name: string | null;
  event_date: string | null;
  cover: number;
  guest_token: string;
}

export const followedKey = "followed";

export function cachedFollowed(): FollowedList[] | undefined {
  return cached<FollowedList[]>(followedKey);
}

export function loadFollowed(): Promise<FollowedList[]> {
  return load(followedKey, async () => {
    const { data, error } = await db().rpc("my_followed_lists");
    if (error) throw error;
    return (data ?? []) as FollowedList[];
  });
}

/** Liste aus dem eigenen Konto entfernen (der Gast-Link funktioniert weiter). */
export async function unfollow(list: FollowedList, userId: string) {
  const { error } = await db().from("list_followers").delete().eq("list_id", list.list_id).eq("user_id", userId);
  if (error) throw error;
  forgetGuestList(list.guest_token);
  remember(followedKey, (cachedFollowed() ?? []).filter((l) => l.list_id !== list.list_id));
}

/**
 * Einmal pro Konto und Gerät: Was auf diesem Gerät vor der Anmeldung geöffnet und reserviert wurde,
 * ins Konto übernehmen (Listen speichern, Reservierungen zuordnen).
 */
export async function syncDeviceToAccount(userId: string) {
  const flag = KEYS.deviceSynced(userId);
  if (hasFlag(flag)) return;
  const client = db();
  const codes = getCodes();
  if (codes.length) await client.rpc("claim_reservations", { p_codes: codes });
  for (const l of getGuestLists()) await client.rpc("follow_list", { p_token: l.token });
  setFlag(flag);
}
