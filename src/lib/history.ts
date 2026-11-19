import { OCCASIONS, type Occasion } from "./types";
import { formatPrice } from "./wishes";
import { euroShort } from "./gift";
import { dateLabel } from "./format";

/** Ein Eintrag im Verlauf, wie ihn die Datenbank liefert (siehe supabase/19_verlauf.sql). */
export interface AuditEntry {
  id: number;
  at: string;
  kind: "list" | "wish" | "reservation" | "member" | "access";
  action: string;
  actor_name: string | null;
  data: Record<string, unknown>;
}

type Change = { alt: unknown; neu: unknown };
const PRIO: Record<string, string> = { heart: "Herzenswunsch", nice: "Wäre schön", small: "Kleine Aufmerksamkeit" };
const q = (t: unknown) => `„${String(t ?? "")}“`;
const s = (v: unknown) => (v == null ? "" : String(v));

/** Wie ein geänderter Wert in Worten heißt. */
function value(field: string, v: unknown): string {
  if (v == null || v === "") return "";
  switch (field) {
    case "price_cents": return formatPrice(Number(v));
    case "priority": return PRIO[s(v)] ?? s(v);
    case "occasion": return OCCASIONS[s(v) as Occasion] ?? s(v);
    case "event_date": return dateLabel(s(v));
    case "quantity": return `${v} Stück`;
    default: return q(v);
  }
}

const LABEL: Record<string, string> = {
  title: "Name", price_cents: "Preis", quantity: "Menge", priority: "Priorität", note: "Notiz", url: "Link", shop: "Shop",
  description: "Beschreibung", recipient_name: "Für", occasion: "Anlass", event_date: "Datum", cover: "Symbol",
};

/** Eine Änderung als kurze Wendung, z. B. „Preis von 349 € auf 329 €“. */
export function describeChange(field: string, c: Change): string {
  if (field === "group_gift") return c.neu ? "„Gemeinsam schenken“ eingeschaltet" : "„Gemeinsam schenken“ ausgeschaltet";
  if (field === "allow_parents_buy") return c.neu ? "„Wir besorgen auf Wunsch“ eingeschaltet" : "„Wir besorgen auf Wunsch“ ausgeschaltet";
  if (field === "image") return !c.alt ? "Bild hinzugefügt" : !c.neu ? "Bild entfernt" : "Bild ersetzt";
  if (field === "cover") return "Symbol geändert";
  const label = LABEL[field] ?? field;
  if (field === "note" || field === "description" || field === "url") {
    return !c.alt ? `${label} hinzugefügt` : !c.neu ? `${label} entfernt` : `${label} geändert`;
  }
  const a = value(field, c.alt), n = value(field, c.neu);
  if (!a) return `${label} ${n} gesetzt`;
  if (!n) return `${label} entfernt`;
  return `${label} von ${a} auf ${n}`;
}

function changeList(data: Record<string, unknown>): string {
  const ch = (data.changes ?? {}) as Record<string, Change>;
  return Object.entries(ch).map(([f, c]) => describeChange(f, c)).join(", ");
}

/** Der Eintrag als ganzer Satz. */
export function describe(e: AuditEntry): string {
  const who = e.actor_name?.trim() || "Jemand";
  const d = e.data ?? {};
  const wish = q(d.wish), title = q(d.title), guest = s(d.guest) || "Ein Gast", member = s(d.member) || "Jemand";
  const contribution = d.amount_cents != null;
  switch (`${e.kind}:${e.action}`) {
    // Liste
    case "list:created": return `${who} hat die Liste angelegt.`;
    case "list:updated": return `${who} hat die Liste geändert: ${changeList(d)}.`;
    case "list:archived": return `${who} hat die Liste abgeschlossen. Gäste können sie nicht mehr öffnen.`;
    case "list:restored": return `${who} hat die Liste wieder geöffnet.`;
    case "list:link_renewed": return `${who} hat den Gast-Link erneuert. Der alte Link funktioniert nicht mehr.`;
    // Wünsche
    case "wish:created": return `${who} hat ${title} hinzugefügt.`;
    case "wish:updated": return `${who} hat ${title} geändert: ${changeList(d)}.`;
    case "wish:deleted": return `${who} hat ${title} gelöscht.`;
    case "wish:moved_out": return `${who} hat ${title} nach ${q(d.to)} verschoben.`;
    case "wish:moved_in": return `${who} hat ${title} aus ${q(d.from)} hierher verschoben.`;
    // Reservierungen
    case "reservation:reserved": {
      const extra = [Number(d.quantity) > 1 ? `${d.quantity} Stück` : "", d.parents_buy ? "ihr besorgt es" : ""].filter(Boolean).join(", ");
      const tail = extra ? ` (${extra})` : "";
      return d.by_family ? `${who} hat ${wish} für ${guest} reserviert${tail}.` : `${guest} hat ${wish} reserviert${tail}.`;
    }
    case "reservation:contributed":
      return d.by_family
        ? `${who} hat ${euroShort(Number(d.amount_cents))} von ${guest} für ${wish} eingetragen.`
        : `${guest} steuert ${euroShort(Number(d.amount_cents))} zu ${wish} bei.`;
    case "reservation:cancelled":
      return contribution ? `${guest} hat den Beitrag zu ${wish} zurückgezogen.` : `${guest} hat die Reservierung für ${wish} aufgehoben.`;
    case "reservation:released":
      return contribution
        ? `${who} hat den Beitrag von ${guest} zu ${wish} freigegeben.`
        : `${who} hat die Reservierung von ${guest} für ${wish} freigegeben.`;
    // Mitglieder
    case "member:joined": return `${member} ist der Liste als Mitbearbeiter beigetreten.`;
    case "member:added": return e.actor_name ? `${who} hat ${member} als Mitbearbeiter hinzugefügt.` : `${member} wurde als Mitbearbeiter hinzugefügt.`;
    case "member:left": return `${member} hat die Liste verlassen.`;
    case "member:removed": return `${who} hat ${member} aus der Liste entfernt.`;
    case "member:follower_saved": return `${member} hat die Liste zum Schenken im eigenen Konto gespeichert.`;
    case "member:follower_added": return `${who} hat die Liste für ${member} zum Schenken freigegeben.`;
    case "member:follower_removed": return `${who} hat die Liste aus dem Konto von ${member} entfernt.`;
    case "member:follower_left": return `${member} hat die Liste aus dem eigenen Konto entfernt.`;
    // Zugang (nur Administratoren)
    case "access:requested": return `${s(d.email)} hat ohne Einladung Zugang angefragt.`;
    case "access:invite_pending": return `${who} möchte ${s(d.email)} einladen${d.list ? ` (Liste ${q(d.list)})` : ""}. Wartet auf Freigabe.`;
    case "access:approved": return `${who} hat ${s(d.email)} freigegeben.`;
    case "access:denied": return `${who} hat die Anfrage von ${s(d.email)} abgelehnt.`;
    case "access:allowed": return e.actor_name ? `${who} hat ${s(d.email)} freigeschaltet.` : `${s(d.email)} wurde freigeschaltet.`;
    case "access:admin_added": return `${member} ist jetzt Administrator.`;
    case "access:admin_removed": return `${member} ist kein Administrator mehr.`;
    case "access:type_changed":
      return d.type === "family"
        ? `${who} hat ${member} auf „Familie“ umgestellt. ${member} darf jetzt eigene Listen anlegen.`
        : `${who} hat ${member} auf „Zum Schenken“ umgestellt. ${member} kann keine eigenen Listen mehr anlegen.`;
    default: return `${who}: ${e.action}`;
  }
}

/** Überschrift für einen Tag: „Heute“, „Gestern“ oder „Donnerstag, 12. November“. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
