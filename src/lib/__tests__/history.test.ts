import { describe as group, expect, it } from "vitest";
import { dayLabel, describe, type AuditEntry } from "../history";

const E = (kind: AuditEntry["kind"], action: string, data: Record<string, unknown>, actor: string | null = "Julia"): AuditEntry =>
  ({ id: 1, at: "2026-11-12T10:00:00Z", kind, action, actor_name: actor, data });
const plain = (t: string) => t.replace(/\u00a0/g, " ");

group("Verlauf in Sätzen", () => {
  it("Wunsch geändert, mit mehreren Änderungen", () => {
    expect(plain(describe(E("wish", "updated", { title: "Kinderfahrrad", changes: {
      price_cents: { alt: 34900, neu: 32900 }, priority: { alt: "nice", neu: "heart" }, note: { alt: "a", neu: "b" } } }))))
      .toBe("Julia hat „Kinderfahrrad“ geändert: Preis von 349 € auf 329 €, Priorität von Wäre schön auf Herzenswunsch, Notiz geändert.");
  });
  it("Bild und Gemeinsam schenken", () => {
    expect(describe(E("wish", "updated", { title: "Rad", changes: { image: { alt: false, neu: true }, group_gift: { alt: false, neu: true } } })))
      .toBe("Julia hat „Rad“ geändert: Bild hinzugefügt, „Gemeinsam schenken“ eingeschaltet.");
  });
  it("Reservierung durch Gast, mit Stückzahl und „ihr besorgt es“", () => {
    expect(describe(E("reservation", "reserved", { wish: "Tonies", guest: "Oma Gisela", quantity: 2, parents_buy: true }, "Oma Gisela")))
      .toBe("Oma Gisela hat „Tonies“ reserviert (2 Stück, ihr besorgt es).");
  });
  it("Reservierung von Eltern für jemanden eingetragen", () => {
    expect(describe(E("reservation", "reserved", { wish: "Puppe", guest: "Opa Heinz", quantity: 1, by_family: true })))
      .toBe("Julia hat „Puppe“ für Opa Heinz reserviert.");
  });
  it("Beitrag und Zurückziehen", () => {
    expect(plain(describe(E("reservation", "contributed", { wish: "Rad", guest: "Tobias", amount_cents: 5000 }, "Tobias")))).toBe("Tobias steuert 50 € zu „Rad“ bei.");
    expect(describe(E("reservation", "cancelled", { wish: "Rad", guest: "Tobias", amount_cents: 5000 }, "Tobias"))).toBe("Tobias hat den Beitrag zu „Rad“ zurückgezogen.");
  });
  it("Aufheben durch Gast und Freigeben durch Eltern", () => {
    expect(describe(E("reservation", "cancelled", { wish: "Brille", guest: "Oma" }, "Oma"))).toBe("Oma hat die Reservierung für „Brille“ aufgehoben.");
    expect(describe(E("reservation", "released", { wish: "Brille", guest: "Oma" }))).toBe("Julia hat die Reservierung von Oma für „Brille“ freigegeben.");
  });
  it("Verschieben in beide Richtungen", () => {
    expect(describe(E("wish", "moved_out", { title: "Ball", to: "Leons Liste" }))).toBe("Julia hat „Ball“ nach „Leons Liste“ verschoben.");
    expect(describe(E("wish", "moved_in", { title: "Ball", from: "Emmas Liste" }))).toBe("Julia hat „Ball“ aus „Emmas Liste“ hierher verschoben.");
  });
  it("Liste geändert: Datum, Anlass, Einstellung", () => {
    expect(describe(E("list", "updated", { changes: { occasion: { alt: "birthday", neu: "christmas" }, allow_parents_buy: { alt: false, neu: true } } })))
      .toBe("Julia hat die Liste geändert: Anlass von Geburtstag auf Weihnachten, „Wir besorgen auf Wunsch“ eingeschaltet.");
  });
  it("Mitglieder und Zugang", () => {
    expect(describe(E("member", "removed", { member: "Markus" }))).toBe("Julia hat Markus aus der Liste entfernt.");
    expect(describe(E("access", "invite_pending", { email: "anna@x.de", list: "Emmas Geburtstag" }, "Markus")))
      .toBe("Markus möchte anna@x.de einladen (Liste „Emmas Geburtstag“). Wartet auf Freigabe.");
    expect(describe(E("access", "allowed", { email: "a@b.de" }, null))).toBe("a@b.de wurde freigeschaltet.");
  });
  it("Unbekannter Name wird zu „Jemand“", () => {
    expect(describe(E("wish", "deleted", { title: "X" }, null))).toBe("Jemand hat „X“ gelöscht.");
  });
});

group("Tagesüberschriften", () => {
  const now = new Date("2026-11-13T12:00:00");
  it("heute, gestern, sonst Wochentag und Datum", () => {
    expect(dayLabel("2026-11-13T08:00:00", now)).toBe("Heute");
    expect(dayLabel("2026-11-12T20:00:00", now)).toBe("Gestern");
    expect(dayLabel("2026-11-10T08:00:00", now)).toBe("Dienstag, 10. November");
    expect(dayLabel("2025-12-24T08:00:00", now)).toBe("Mittwoch, 24. Dezember 2025");
  });
});
