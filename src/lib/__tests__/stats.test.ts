import { describe, expect, it } from "vitest";
import { computeReview, computeStats, type StatList, type StatRes, type StatWish } from "../stats";

const me = "me";
const lists: StatList[] = [
  { id: "a", title: "Emmas Geburtstag", recipient_name: "Emma", event_date: "2026-12-14", archived_at: null, list_members: [{ user_id: me, show_reservations: true }] },
  { id: "b", title: "Emmas Weihnachten 2025", recipient_name: "emma ", event_date: "2025-12-24", archived_at: "2026-01-05", list_members: [{ user_id: me, show_reservations: true }] },
  { id: "c", title: "Papas Liste", recipient_name: "Markus", event_date: null, archived_at: null, list_members: [{ user_id: me, show_reservations: false }] },
];
const W = (id: string, list_id: string, price: number | null, quantity: number, priority: StatWish["priority"], shop: string | null, created_at: string): StatWish =>
  ({ id, list_id, title: id, price_cents: price, quantity, priority, shop, created_at });
const wishes = [
  W("rad", "a", 34900, 1, "heart", "Decathlon", "2026-11-01T10:00:00Z"),
  W("tonie", "a", 1699, 3, "nice", "tonies", "2026-11-01T10:00:00Z"),
  W("buch", "a", 1300, 1, "heart", "Thalia", "2026-11-02T10:00:00Z"),
  W("brille", "a", null, 1, "small", null, "2026-11-02T10:00:00Z"),
  W("mikro", "b", 4500, 1, "heart", "Thalia", "2025-11-01T10:00:00Z"),
  W("papa", "c", 9900, 1, "nice", null, "2026-11-01T10:00:00Z"),
  { ...W("rad2", "d", 30000, 1, "heart", null, "2026-11-01T10:00:00Z"), group_gift: true },
];
const R = (id: string, wish_id: string, quantity: number, guest_name: string, created_at: string): StatRes => ({ id, wish_id, quantity, guest_name, created_at });
const res = [
  { ...R("r1", "rad", 1, "Oma Gisela", "2026-11-04T10:00:00Z"), parents_buy: true },
  R("r2", "tonie", 2, "Familie Yilmaz", "2026-12-10T10:00:00Z"),
  R("r3", "tonie", 1, " oma gisela", "2026-12-20T10:00:00Z"),
  R("r4", "mikro", 1, "Tante Sabine", "2025-12-01T10:00:00Z"),
  { ...R("g1", "rad2", 0, "Oma Gisela", "2026-11-10T10:00:00Z"), amount_cents: 10000 },
  { ...R("g2", "rad2", 0, "Onkel Tobias", "2026-11-11T10:00:00Z"), amount_cents: 5000 },
];

describe("Gruppengeschenke in der Statistik", () => {
  const listsD: StatList[] = [{ id: "d", title: "Gemeinsam", recipient_name: "Emma", event_date: "2026-12-24", archived_at: null, list_members: [{ user_id: me, show_reservations: true }] }];
  const s = computeStats(listsD, wishes, res, new Set(["d"]), me);
  it("zählt ein Gruppengeschenk erst als vergeben, wenn alles zusammen ist", () => {
    expect(s.stand).toMatchObject({ taken: 0, total: 1 });
  });
  it("rechnet die zugesagten Beiträge als reservierten Wert und als Geld für die Eltern", () => {
    expect(s.geld.reservedValue).toBe(15000);
    expect(s.geld.parentsBuy).toEqual({ items: 1, value: 15000 });
  });
  it("zeigt bei Schenkenden den Beitrag", () => {
    expect(s.schenkende.ranking.find((r) => r.name === "Oma Gisela")?.value).toBe(10000);
  });
});

describe("Statistik", () => {
  const s = computeStats(lists, wishes, res, new Set(["a", "c"]), me);
  it("zählt den Stand und die Herzenswünsche", () => {
    expect(s.stand).toMatchObject({ taken: 4, total: 7, hearts: 2, heartsDone: 1 });
    expect(s.hiddenLists).toBe(1);
  });
  it("rechnet die Geldwerte", () => {
    expect(s.geld.totalValue).toBe(34900 + 3 * 1699 + 1300 + 9900);
    expect(s.geld.reservedValue).toBe(34900 + 3 * 1699);
    expect(s.geld.buckets.map((b) => b.count)).toEqual([2, 0, 2, 1]);
  });
  it("zählt, was die Eltern besorgen sollen", () => {
    expect(s.geld.parentsBuy).toEqual({ items: 1, value: 34900 });
  });
  it("fasst gleiche Schenkende zusammen", () => {
    expect(s.schenkende.distinct).toBe(2);
    expect(s.schenkende.ranking[0]).toMatchObject({ name: "Oma Gisela", items: 2 });
  });
  it("ordnet Reservierungen den Wochen vor dem Anlass zu", () => {
    expect(s.zeit.weeks[3].count).toBe(1);
    expect(s.zeit.weeks[8].count).toBe(2);
    expect(s.zeit.weeks[9].count).toBe(1);
  });
  it("erstellt den Rückblick pro Kind über alle Listen", () => {
    const emma = computeReview(lists, wishes, res).find((g) => g.name.toLowerCase().startsWith("emma"))!;
    expect(emma).toMatchObject({ lists: 2, wishes: 5, fulfilled: 3, years: [2025, 2026] });
    expect(emma.topShops[0]).toBe("Thalia");
  });
});
