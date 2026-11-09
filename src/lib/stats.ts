import type { Priority } from "./types";

export interface StatList { id: string; title: string; recipient_name: string | null; event_date: string | null; archived_at: string | null; list_members: { user_id: string; show_reservations: boolean }[] }
export interface StatWish { id: string; list_id: string; title: string; price_cents: number | null; quantity: number; priority: Priority; shop: string | null; created_at: string }
export interface StatRes { id: string; wish_id: string; quantity: number; guest_name: string; created_at: string; parents_buy?: boolean }

const DAY = 864e5;
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const day = (s: string) => new Date(s.length <= 10 ? s + "T00:00:00" : s);

export interface Stats {
  hiddenLists: number;
  stand: { total: number; taken: number; hearts: number; heartsDone: number; next: { title: string; days: number } | null };
  geld: { totalValue: number; reservedValue: number; avgPrice: number | null; buckets: { label: string; count: number }[]; parentsBuy: { items: number; value: number } };
  schenkende: { distinct: number; ranking: { name: string; items: number; value: number }[] };
  zeit: { weeks: { label: string; count: number }[]; avgDaysToReserve: number | null; hasDates: boolean };
}

export function computeStats(lists: StatList[], wishes: StatWish[], res: StatRes[], scope: Set<string>, me: string): Stats {
  const scoped = lists.filter((l) => scope.has(l.id));
  const ws = wishes.filter((w) => scope.has(w.list_id));
  const wishById = new Map(ws.map((w) => [w.id, w]));
  const rs = res.filter((r) => wishById.has(r.wish_id));
  const takenOf = new Map<string, number>();
  for (const r of rs) takenOf.set(r.wish_id, (takenOf.get(r.wish_id) ?? 0) + r.quantity);
  const taken = (w: StatWish) => Math.min(w.quantity, takenOf.get(w.id) ?? 0);

  // Stand
  const hearts = ws.filter((w) => w.priority === "heart");
  const upcoming = scoped
    .filter((l) => !l.archived_at && l.event_date)
    .map((l) => ({ title: l.title, days: Math.round((day(l.event_date!).getTime() - today().getTime()) / DAY) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)[0] ?? null;

  // Geld
  const priced = ws.filter((w) => w.price_cents != null);
  const buckets = [
    { label: "bis 20 €", count: priced.filter((w) => w.price_cents! <= 2000).length },
    { label: "20 bis 50 €", count: priced.filter((w) => w.price_cents! > 2000 && w.price_cents! <= 5000).length },
    { label: "über 50 €", count: priced.filter((w) => w.price_cents! > 5000).length },
    { label: "ohne Preis", count: ws.length - priced.length },
  ];

  // Schenkende (Namen ohne Groß-/Kleinschreibung und Leerzeichen zusammenfassen)
  const people = new Map<string, { name: string; items: number; value: number }>();
  for (const r of rs) {
    const key = r.guest_name.trim().toLowerCase().replace(/\s+/g, " ");
    const p = people.get(key) ?? { name: r.guest_name.trim(), items: 0, value: 0 };
    p.items += r.quantity;
    p.value += (wishById.get(r.wish_id)?.price_cents ?? 0) * r.quantity;
    people.set(key, p);
  }
  const ranking = [...people.values()].sort((a, b) => b.items - a.items || b.value - a.value);

  // Zeitverlauf: Reservierungen nach Wochen vor dem Anlass
  const eventOf = new Map(scoped.map((l) => [l.id, l.event_date]));
  const labels = ["8+ Wochen", "7 Wo.", "6 Wo.", "5 Wo.", "4 Wo.", "3 Wo.", "2 Wo.", "1 Wo.", "letzte Woche", "danach"];
  const weeks = labels.map((label) => ({ label, count: 0 }));
  let hasDates = false;
  for (const r of rs) {
    const ev = eventOf.get(wishById.get(r.wish_id)!.list_id);
    if (!ev) continue;
    hasDates = true;
    const diff = (day(ev).getTime() - new Date(r.created_at).getTime()) / DAY;
    const idx = diff < 0 ? 9 : 8 - Math.min(8, Math.floor(diff / 7));
    weeks[idx].count += r.quantity;
  }
  const waits = rs.map((r) => (new Date(r.created_at).getTime() - new Date(wishById.get(r.wish_id)!.created_at).getTime()) / DAY).filter((d) => d >= 0);

  return {
    hiddenLists: scoped.filter((l) => l.list_members.find((m) => m.user_id === me)?.show_reservations === false).length,
    stand: { total: ws.reduce((a, w) => a + w.quantity, 0), taken: ws.reduce((a, w) => a + taken(w), 0), hearts: hearts.length, heartsDone: hearts.filter((w) => taken(w) >= w.quantity).length, next: upcoming },
    geld: {
      totalValue: priced.reduce((a, w) => a + w.price_cents! * w.quantity, 0),
      reservedValue: priced.reduce((a, w) => a + w.price_cents! * taken(w), 0),
      avgPrice: priced.length ? Math.round(priced.reduce((a, w) => a + w.price_cents!, 0) / priced.length) : null,
      buckets,
      parentsBuy: rs.filter((r) => r.parents_buy).reduce((a, r) => ({ items: a.items + r.quantity, value: a.value + (wishById.get(r.wish_id)?.price_cents ?? 0) * r.quantity }), { items: 0, value: 0 }),
    },
    schenkende: { distinct: people.size, ranking },
    zeit: { weeks, avgDaysToReserve: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null, hasDates },
  };
}

/** Rückblick pro beschenkter Person über alle Listen und Jahre. */
export function computeReview(lists: StatList[], wishes: StatWish[], res: StatRes[]) {
  const takenOf = new Map<string, number>();
  for (const r of res) takenOf.set(r.wish_id, (takenOf.get(r.wish_id) ?? 0) + r.quantity);
  const groups = new Map<string, { name: string; lists: number; wishes: number; fulfilled: number; years: Set<number>; shops: Map<string, number> }>();
  for (const l of lists) {
    const name = l.recipient_name?.trim() || "Ohne Namen";
    const g = groups.get(name.toLowerCase()) ?? { name, lists: 0, wishes: 0, fulfilled: 0, years: new Set<number>(), shops: new Map() };
    g.lists += 1;
    if (l.event_date) g.years.add(day(l.event_date).getFullYear());
    for (const w of wishes.filter((x) => x.list_id === l.id)) {
      g.wishes += 1;
      if ((takenOf.get(w.id) ?? 0) >= w.quantity) g.fulfilled += 1;
      if (w.shop) g.shops.set(w.shop, (g.shops.get(w.shop) ?? 0) + 1);
    }
    groups.set(name.toLowerCase(), g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, years: [...g.years].sort(), topShops: [...g.shops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s) }))
    .sort((a, b) => b.wishes - a.wishes);
}
