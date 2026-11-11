import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { cover, type Role } from "../lib/types";
import { takenQuantity } from "../lib/gift";
import { SORT_LABELS, moveItem, sortLists, type ListSort } from "../lib/listSort";
import { cached, isFresh, load as loadCached, remember } from "../lib/cache";
import { listKey, loadListPage } from "../lib/listData";
import { dateLabel, daysUntil, friendlyError, toast } from "../lib/format";
import { IconChart, IconChevron, IconPlus, IconReorder } from "../components/Icons";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";

/** Für die Übersicht: pro Liste die Wünsche mit Menge und (falls sichtbar) den Reservierungen. */
const DASH_SELECT =
  "id,title,recipient_name,event_date,cover,created_at,archived_at,list_members(user_id,role,show_reservations,sort_order),wishes(id,quantity,price_cents,group_gift,reservations(quantity,amount_cents))";

interface DashList {
  id: string;
  title: string;
  recipient_name: string | null;
  event_date: string | null;
  cover: number;
  created_at: string;
  archived_at: string | null;
  list_members: { user_id: string; role: Role; show_reservations: boolean }[];
  wishes: { id: string; quantity: number; price_cents: number | null; group_gift: boolean; reservations: { quantity: number; amount_cents: number | null }[] }[];
}

/** „julia.weber“ oder „Julia Weber“ → „Julia“ */
const firstName = (n: string) => {
  const f = n.trim().split(/[\s._+-]+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
};

export function Dashboard() {
  const { session, displayName } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<DashList[] | null>(() => cached<DashList[]>("dashboard") ?? null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<ListSort>(() => cached<ListSort>("list-sort") ?? "custom");
  const [order, setOrder] = useState<string[] | null>(null); // gesetzt = Verschieben-Modus

  // Gewählte Sortierung aus dem Profil (gilt auf allen Geräten)
  useEffect(() => {
    if (!session) return;
    loadCached("list-sort", async () => {
      const { data } = await db().from("profiles").select("list_sort").eq("id", session.user.id).maybeSingle();
      return ((data?.list_sort as ListSort) ?? "custom");
    }).then(setSort, () => undefined);
  }, [session]);

  const chooseSort = async (v: ListSort) => {
    setSort(v);
    remember("list-sort", v);
    await db().from("profiles").update({ list_sort: v }).eq("id", session!.user.id);
  };

  const saveOrder = async () => {
    if (!order) return;
    setBusy(true);
    const { error } = await db().rpc("set_list_order", { p_ids: order });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    // Sofort übernehmen, ohne auf das Neuladen zu warten
    setLists((ls) => ls && ls.map((l) => ({
      ...l,
      list_members: l.list_members.map((m) => (m.user_id === session?.user.id ? { ...m, sort_order: order.indexOf(l.id) + 1 || null } : m)),
    })));
    if (sort !== "custom") await chooseSort("custom");
    setOrder(null);
    toast("Reihenfolge gespeichert.");
    load();
  };

  const load = useCallback(async () => {
    try {
      const data = await loadCached("dashboard", async () => {
        const { data, error } = await db().from("lists").select(DASH_SELECT).order("created_at", { ascending: false });
        if (error) throw error;
        return data as unknown as DashList[];
      });
      setLists(data);
      // Im Leerlauf die aktiven Listen vorladen, damit das Antippen sofort geht
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
      idle(() => data.filter((l) => !l.archived_at).slice(0, 6).forEach((l) => { if (!isFresh(listKey(l.id))) loadListPage(l.id).catch(() => undefined); }));
    } catch (e) {
      if (!cached("dashboard")) setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (v: ListInput) => {
    setBusy(true);
    const r = toRow(v);
    const { data, error } = await db().rpc("create_list", {
      p_title: r.title, p_recipient_name: r.recipient_name, p_occasion: r.occasion,
      p_event_date: r.event_date, p_cover: r.cover, p_description: r.description, p_allow_parents_buy: r.allow_parents_buy,
    });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setCreating(false);
    toast("Liste angelegt.");
    navigate(`/liste/${(data as { id: string }).id}`);
  };

  const me = session?.user.id ?? "";
  const active = sortLists((lists ?? []).filter((l) => !l.archived_at), sort, me);
  const shown = order ? order.map((id) => active.find((l) => l.id === id)!).filter(Boolean) : active;
  const archived = (lists ?? []).filter((l) => l.archived_at);
  const upcoming = active
    .filter((l) => (daysUntil(l.event_date) ?? -1) >= 0)
    .sort((a, b) => (daysUntil(a.event_date) ?? 0) - (daysUntil(b.event_date) ?? 0))[0];
  const upcomingDays = upcoming ? daysUntil(upcoming.event_date) : null;

  return (
    <div className="wrap with-bottom-bar">
      <div className="page-head">
        <div className="page-head-top">
          <h1>Hallo {firstName(displayName)}</h1>
          {lists && lists.length > 0 && <Link className="btn soft small" to="/statistik"><IconChart /> Statistik</Link>}
        </div>
        <p className="lead">
          {upcoming
            ? `Als Nächstes: ${upcoming.title} ${upcomingDays === 0 ? "heute" : upcomingDays === 1 ? "morgen" : `in ${upcomingDays} Tagen`}`
            : "Hier findest du alle deine Wunschlisten."}
        </p>
      </div>

      {error && <p className="notice error" role="alert">{error} <button className="btn small soft" onClick={load}>Erneut laden</button></p>}
      {!lists && !error && <p className="loading">Listen werden geladen …</p>}

      {lists && active.length === 0 && (
        <div className="empty">
          <p>Noch keine Wunschliste. Leg die erste an, das dauert eine Minute.</p>
        </div>
      )}

      {lists && active.length > 1 && (
        <div className="sort-bar">
          {order ? (
            <>
              <span className="sort-hint">Mit den Pfeilen verschieben</span>
              <span className="sort-actions">
                <button className="btn soft small" onClick={() => setOrder(null)}>Abbrechen</button>
                <button className="btn small" disabled={busy} onClick={saveOrder}>Fertig</button>
              </span>
            </>
          ) : (
            <>
              <label className="sort-select">
                <span className="sr">Sortieren</span>
                <select className="select small" value={sort} onChange={(e) => chooseSort(e.target.value as ListSort)} aria-label="Listen sortieren">
                  {(Object.keys(SORT_LABELS) as ListSort[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
                </select>
              </label>
              <button className="btn quiet small" onClick={() => setOrder(active.map((l) => l.id))}><IconReorder /> Verschieben</button>
            </>
          )}
        </div>
      )}

      {lists && active.length > 0 && (
        <div className={`list-rows ${order ? "reordering" : ""}`}>
          {shown.map((l, idx) => {
            const c = cover(l.cover);
            const mine = l.list_members.find((m) => m.user_id === me);
            const show = mine?.show_reservations ?? true;
            const total = l.wishes.reduce((a, w) => a + w.quantity, 0);
            const taken = l.wishes.reduce((a, w) => a + takenQuantity(w, w.reservations ?? []), 0);
            const pct = total ? Math.round((taken / total) * 100) : 0;
            const n = l.wishes.length;
            if (order) {
              return (
                <div className="list-row" key={l.id}>
                  <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                  <span className="list-text"><span className="list-title">{l.title}</span></span>
                  <span className="move-btns">
                    <button type="button" aria-label={`„${l.title}“ nach oben`} disabled={idx === 0} onClick={() => setOrder(moveItem(order, idx, -1))}>▲</button>
                    <button type="button" aria-label={`„${l.title}“ nach unten`} disabled={idx === shown.length - 1} onClick={() => setOrder(moveItem(order, idx, 1))}>▼</button>
                  </span>
                </div>
              );
            }
            return (
              <Link className="list-row" to={`/liste/${l.id}`} key={l.id}>
                <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                <span className="list-text">
                  <span className="list-title">{l.title}</span>
                  <span className="list-meta">
                    {[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}
                    {mine?.role === "editor" && <span className="badge" style={{ marginLeft: 6 }}>Mitbearbeitung</span>}
                  </span>
                  {n === 0 ? (
                    <span className="list-progress-text">Noch keine Wünsche</span>
                  ) : show ? (
                    <span className="list-progress">
                      <span className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      <span className="list-progress-text">{taken === 0 ? "noch nichts vergeben" : `${taken} von ${total} vergeben`}</span>
                    </span>
                  ) : (
                    <span className="list-progress-text">{n} {n === 1 ? "Wunsch" : "Wünsche"}</span>
                  )}
                </span>
                <span className="list-chev" aria-hidden="true"><IconChevron /></span>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <details className="arch">
          <summary>Abgeschlossen ({archived.length})</summary>
          <div className="list-rows" style={{ marginTop: 10 }}>
            {archived.map((l) => {
              const c = cover(l.cover);
              return (
                <Link className="list-row is-archived" to={`/liste/${l.id}`} key={l.id}>
                  <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                  <span className="list-text">
                    <span className="list-title">{l.title}</span>
                    <span className="list-meta">{[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="list-chev" aria-hidden="true"><IconChevron /></span>
                </Link>
              );
            })}
          </div>
        </details>
      )}

      <div className="bottom-bar">
        <button className="btn block big" onClick={() => setCreating(true)}><IconPlus /> Neue Liste</button>
      </div>

      <FormSheet open={creating} onClose={() => setCreating(false)} title="Neue Liste" formId="new-list" submitLabel="Anlegen" busy={busy}>
        <ListForm formId="new-list" onSubmit={create} />
      </FormSheet>
    </div>
  );
}
