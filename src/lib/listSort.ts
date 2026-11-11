/** Sortierung der Listen in der Übersicht. Jede Person hat ihre eigene Reihenfolge. */
export type ListSort = "custom" | "date" | "new" | "name";

export const SORT_LABELS: Record<ListSort, string> = {
  custom: "Eigene Reihenfolge",
  date: "Nächster Anlass",
  new: "Neueste zuerst",
  name: "Name A–Z",
};

interface Sortable {
  id: string;
  title: string;
  event_date: string | null;
  created_at: string;
  list_members: { user_id: string; sort_order?: number | null }[];
}

const today = () => new Date().toISOString().slice(0, 10);

export function sortLists<T extends Sortable>(lists: T[], mode: ListSort, me: string): T[] {
  const byNew = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  const arr = [...lists];
  if (mode === "new") return arr.sort(byNew);
  if (mode === "name") return arr.sort((a, b) => a.title.localeCompare(b.title, "de", { sensitivity: "base" }) || byNew(a, b));
  if (mode === "date") {
    // Bevorstehende zuerst (der nächste oben), dann ohne Datum, dann vergangene (die jüngste oben)
    const t = today();
    const rank = (l: T) => (!l.event_date ? 1 : l.event_date >= t ? 0 : 2);
    return arr.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      if (rank(a) === 0) return a.event_date!.localeCompare(b.event_date!);
      if (rank(a) === 2) return b.event_date!.localeCompare(a.event_date!);
      return byNew(a, b);
    });
  }
  // Eigene Reihenfolge: gespeicherte Position; noch nicht einsortierte (neue) Listen oben
  const pos = (l: T) => l.list_members.find((m) => m.user_id === me)?.sort_order ?? null;
  return arr.sort((a, b) => {
    const pa = pos(a), pb = pos(b);
    if (pa == null && pb == null) return byNew(a, b);
    if (pa == null) return -1;
    if (pb == null) return 1;
    return pa - pb;
  });
}

/** Verschiebt den Eintrag an Position i um eine Stelle nach oben (-1) oder unten (+1). */
export function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
