import { describe, expect, it } from "vitest";
import { moveItem, sortLists } from "../listSort";

const me = "me";
const L = (id: string, title: string, event_date: string | null, created_at: string, sort_order: number | null = null) =>
  ({ id, title, event_date, created_at, list_members: [{ user_id: me, sort_order }, { user_id: "andere", sort_order: 1 }] });
const in10 = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const in40 = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
const lists = [
  L("a", "Emmas Geburtstag", in40, "2026-11-01", 2),
  L("b", "Leons Weihnachten", in10, "2026-10-01", 1),
  L("c", "Ostern", "2026-04-05", "2026-03-01", 3),
  L("d", "ideen", null, "2026-11-05", null),
];
const ids = (x: { id: string }[]) => x.map((l) => l.id).join("");

describe("Listen sortieren", () => {
  it("eigene Reihenfolge, neue Listen ohne Platz oben", () => expect(ids(sortLists(lists, "custom", me))).toBe("dbac"));
  it("nur die eigene Position zählt, nicht die anderer Mitglieder", () => {
    expect(ids(sortLists([L("x", "X", null, "2026-01-01", 5), L("y", "Y", null, "2026-01-02", 4)], "custom", me))).toBe("yx");
  });
  it("nächster Anlass: bevorstehende, dann ohne Datum, dann vergangene", () => expect(ids(sortLists(lists, "date", me))).toBe("badc"));
  it("neueste zuerst", () => expect(ids(sortLists(lists, "new", me))).toBe("dabc"));
  it("Name A–Z ohne Rücksicht auf Groß- und Kleinschreibung", () => expect(ids(sortLists(lists, "name", me))).toBe("adbc"));
});

describe("Verschieben", () => {
  it("nach oben und unten, am Rand passiert nichts", () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
