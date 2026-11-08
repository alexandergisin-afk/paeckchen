import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { cover, type Role } from "../lib/types";
import { dateLabel, daysUntil, friendlyError, toast } from "../lib/format";
import { IconChart, IconChevron, IconPlus } from "../components/Icons";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";

/** Für die Übersicht: pro Liste die Wünsche mit Menge und (falls sichtbar) den Reservierungen. */
const DASH_SELECT =
  "id,title,recipient_name,event_date,cover,created_at,archived_at,list_members(user_id,role,show_reservations),wishes(id,quantity,reservations(quantity))";

interface DashList {
  id: string;
  title: string;
  recipient_name: string | null;
  event_date: string | null;
  cover: number;
  created_at: string;
  archived_at: string | null;
  list_members: { user_id: string; role: Role; show_reservations: boolean }[];
  wishes: { id: string; quantity: number; reservations: { quantity: number }[] }[];
}

/** „julia.weber“ oder „Julia Weber“ → „Julia“ */
const firstName = (n: string) => {
  const f = n.trim().split(/[\s._+-]+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
};

export function Dashboard() {
  const { session, displayName } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<DashList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db().from("lists").select(DASH_SELECT).order("created_at", { ascending: false });
    if (error) setError(friendlyError(error));
    else setLists(data as unknown as DashList[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (v: ListInput) => {
    setBusy(true);
    const r = toRow(v);
    const { data, error } = await db().rpc("create_list", {
      p_title: r.title, p_recipient_name: r.recipient_name, p_occasion: r.occasion,
      p_event_date: r.event_date, p_cover: r.cover, p_description: r.description,
    });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setCreating(false);
    toast("Liste angelegt.");
    navigate(`/liste/${(data as { id: string }).id}`);
  };

  const active = (lists ?? []).filter((l) => !l.archived_at);
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

      {lists && active.length > 0 && (
        <div className="list-rows">
          {active.map((l) => {
            const c = cover(l.cover);
            const me = l.list_members.find((m) => m.user_id === session?.user.id);
            const show = me?.show_reservations ?? true;
            const total = l.wishes.reduce((a, w) => a + w.quantity, 0);
            const taken = l.wishes.reduce((a, w) => a + Math.min(w.quantity, (w.reservations ?? []).reduce((s, r) => s + r.quantity, 0)), 0);
            const pct = total ? Math.round((taken / total) * 100) : 0;
            const n = l.wishes.length;
            return (
              <Link className="list-row" to={`/liste/${l.id}`} key={l.id}>
                <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                <span className="list-text">
                  <span className="list-title">{l.title}</span>
                  <span className="list-meta">
                    {[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}
                    {me?.role === "editor" && <span className="badge" style={{ marginLeft: 6 }}>Mitbearbeitung</span>}
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
