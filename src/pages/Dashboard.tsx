import { useCallback, useEffect, useState } from "react";
import { SkeletonRows } from "../components/Skeleton";
import { FollowedLists } from "../components/FollowedLists";
import { usePullToRefresh, useRefreshOnReturn } from "../lib/useRefresh";
import { PullIndicator } from "../components/PullIndicator";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { type Role } from "../lib/types";
import { takenQuantity } from "../lib/gift";
import { SORT_LABELS, sortLists, type ListSort } from "../lib/listSort";
import { useLongPressSort } from "../lib/useDragSort";
import { cached, isFresh, load as loadCached, remember } from "../lib/cache";
import { listKey, loadListPage } from "../lib/listData";
import { daysUntil, friendlyError, toast } from "../lib/format";
import { IconChart, IconPlus } from "../components/Icons";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { hasFlag, KEYS, setFlag } from "../lib/storage";
import { ListRowBody } from "../components/ListRow";

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
  const { session, displayName, accountType } = useAuth();
  const isGuest = accountType === "guest"; // Schenkendenkonto: keine eigenen Listen
  const navigate = useNavigate();
  const [lists, setLists] = useState<DashList[] | null>(() => cached<DashList[]>("dashboard") ?? null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<ListSort>(() => cached<ListSort>("list-sort") ?? "custom");
  const [dragTip, setDragTip] = useState(() => !hasFlag(KEYS.dragTip));

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

  // Nach dem Loslassen sofort speichern (eigene Reihenfolge)
  const saveOrder = async (order: string[]) => {
    setLists((ls) => ls && ls.map((l) => ({
      ...l,
      list_members: l.list_members.map((m) => (m.user_id === session?.user.id ? { ...m, sort_order: order.indexOf(l.id) + 1 || null } : m)),
    })));
    if (sort !== "custom") chooseSort("custom");
    if (dragTip) { setDragTip(false); setFlag(KEYS.dragTip); }
    const { error } = await db().rpc("set_list_order", { p_ids: order });
    if (error) { toast(friendlyError(error)); load(); return; }
    toast("Reihenfolge gespeichert.");
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
  const dnd = useLongPressSort(active.map((l) => l.id), saveOrder);
  const shown = dnd.live ? dnd.live.map((id) => active.find((l) => l.id === id)!).filter(Boolean) : active;
  const archived = (lists ?? []).filter((l) => l.archived_at);
  const upcoming = active
    .filter((l) => (daysUntil(l.event_date) ?? -1) >= 0)
    .sort((a, b) => (daysUntil(a.event_date) ?? 0) - (daysUntil(b.event_date) ?? 0))[0];
  const upcomingDays = upcoming ? daysUntil(upcoming.event_date) : null;

  const ptr = usePullToRefresh(() => load());
  useRefreshOnReturn(() => load());

  return (
    <div className="wrap with-bottom-bar">
      <PullIndicator {...ptr} />
      <div className="page-head">
        <div className="page-head-top">
          <h1>Hallo {firstName(displayName)}</h1>
          {lists && lists.length > 0 && !isGuest && <Link className="btn soft small" to="/statistik"><IconChart /> Statistik</Link>}
        </div>
        <p className="lead">
          {upcoming
            ? `Als Nächstes: ${upcoming.title} ${upcomingDays === 0 ? "heute" : upcomingDays === 1 ? "morgen" : `in ${upcomingDays} Tagen`}`
            : "Hier findest du alle deine Wunschlisten."}
        </p>
      </div>

      {error && <p className="notice error" role="alert">{error} <button className="btn small soft" onClick={load}>Erneut laden</button></p>}
      {!lists && !error && <SkeletonRows count={3} label="Listen werden geladen" />}

      {lists && active.length === 0 && !isGuest && (
        <div className="empty">
          <p>Noch keine Wunschliste. Leg die erste an, das dauert eine Minute.</p>
        </div>
      )}

      {lists && active.length > 1 && (
        <div className="sort-bar">
          <label className="sort-select">
            <span className="sr">Sortieren</span>
            <select className="select small" value={sort} onChange={(e) => chooseSort(e.target.value as ListSort)} aria-label="Listen sortieren">
              {(Object.keys(SORT_LABELS) as ListSort[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </label>
          {dragTip && <span className="sort-hint" id="drag-help">Tipp: Liste gedrückt halten und ziehen, um sie zu verschieben</span>}
        </div>
      )}

      {active.length > 1 && <span className="sr" id="drag-kbd">Mit Alt und Pfeiltaste nach oben oder unten verschieben.</span>}
      {lists && active.length > 0 && (
        <div className={`list-rows ${dnd.drag ? "reordering" : ""}`}>
          {shown.map((l) => {
            const mine = l.list_members.find((m) => m.user_id === me);
            const show = mine?.show_reservations ?? true;
            const total = l.wishes.reduce((a, w) => a + w.quantity, 0);
            const taken = l.wishes.reduce((a, w) => a + takenQuantity(w, w.reservations ?? []), 0);
            const pct = total ? Math.round((taken / total) * 100) : 0;
            const n = l.wishes.length;
            const dragging = dnd.drag?.id === l.id;
            return (
              <Link className={`list-row ${dragging ? "is-dragging" : ""}`} to={`/liste/${l.id}`} key={l.id} draggable={false}
                aria-describedby={active.length > 1 ? "drag-kbd" : undefined}
                style={dragging ? { transform: `translateY(${dnd.drag!.offset}px) scale(1.02)` } : undefined}
                {...dnd.rowProps(l.id)}>
                <ListRowBody list={l} badge={mine?.role === "editor" && <span className="badge ml-6">Mitbearbeiter</span>}>
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
                </ListRowBody>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <details className="arch">
          <summary>Abgeschlossen ({archived.length})</summary>
          <div className="list-rows mt-10">
            {archived.map((l) => {
              return (
                <Link className="list-row is-archived" to={`/liste/${l.id}`} key={l.id}>
                  <ListRowBody list={l} days={false} />
                </Link>
              );
            })}
          </div>
        </details>
      )}

      {accountType && <FollowedLists always={isGuest} />}

      {accountType === "family" && (
        <div className="bottom-bar">
          <button className="btn block big" onClick={() => setCreating(true)}><IconPlus /> Neue Liste</button>
        </div>
      )}

      <FormSheet open={creating} onClose={() => setCreating(false)} title="Neue Liste" formId="new-list" submitLabel="Anlegen" busy={busy}>
        <ListForm formId="new-list" onSubmit={create} />
      </FormSheet>
    </div>
  );
}
