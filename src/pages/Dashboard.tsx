import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, cover, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, daysUntil, friendlyError, toast } from "../lib/format";
import { IconPlus, IconShare } from "../components/Icons";
import { ShareContent } from "../components/ShareSheet";
import { Sheet } from "../components/Sheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";

/** „julia.weber“ oder „Julia Weber“ → „Julia“ */
const firstName = (n: string) => {
  const f = n.trim().split(/[\s._+-]+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
};

export function Dashboard() {
  const { session, displayName } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<WishList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<WishList | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db().from("lists").select(LIST_SELECT).order("created_at", { ascending: false });
    if (error) setError(friendlyError(error));
    else setLists(data as WishList[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (v: ListInput) => {
    setBusy(true);
    const r = toRow(v);
    const { data, error } = await db().rpc("create_list", {
      p_title: r.title,
      p_recipient_name: r.recipient_name,
      p_occasion: r.occasion,
      p_event_date: r.event_date,
      p_cover: r.cover,
      p_description: r.description,
    });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setCreating(false);
    toast("Liste angelegt.");
    navigate(`/liste/${(data as { id: string }).id}`);
  };

  const upcoming = (lists ?? [])
    .filter((l) => (daysUntil(l.event_date) ?? -1) >= 0)
    .sort((a, b) => (daysUntil(a.event_date) ?? 0) - (daysUntil(b.event_date) ?? 0))[0];

  return (
    <div className="wrap">
      <div className="dash-head">
        <div>
          <h1>Hallo {firstName(displayName)}</h1>
          <p className="lead">
            {upcoming ? `Als Nächstes: ${upcoming.title} in ${daysUntil(upcoming.event_date)} Tagen.` : "Hier findest du alle deine Wunschlisten."}
          </p>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>
          <IconPlus /> Neue Liste
        </button>
      </div>

      {error && <p className="notice error" role="alert">{error} <button className="btn small soft" onClick={load}>Erneut laden</button></p>}
      {!lists && !error && <p className="loading">Listen werden geladen …</p>}

      {lists && lists.length === 0 && (
        <div className="empty">
          <p>Noch keine Wunschliste. Leg die erste an, das dauert eine Minute.</p>
          <button className="btn" onClick={() => setCreating(true)}><IconPlus /> Neue Liste</button>
        </div>
      )}

      {lists && lists.length > 0 && (
        <div className="lists">
          {lists.map((l) => {
            const c = cover(l.cover);
            const n = l.wishes?.[0]?.count ?? 0;
            const role = l.list_members?.find((m) => m.user_id === session?.user.id)?.role;
            const cd = countdownLabel(l.event_date);
            return (
              <article className="lcard" key={l.id}>
                <div className={`cover t${c.t}`}><span aria-hidden="true">{c.e}</span></div>
                <div className="body">
                  <h3><Link className="title" to={`/liste/${l.id}`}>{l.title}</Link></h3>
                  <p className="meta">{[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}</p>
                  <p className="meta">
                    {n} {n === 1 ? "Wunsch" : "Wünsche"} {cd && <span className="badge">{cd}</span>}{" "}
                    {role === "editor" && <span className="badge">Mitbearbeitung</span>}
                  </p>
                  <div className="foot">
                    <button className="btn soft small" onClick={() => setSharing(l)}><IconShare /> Teilen</button>
                  </div>
                </div>
              </article>
            );
          })}
          <button className="lcard addcard" onClick={() => setCreating(true)}>
            <IconPlus />
            <span>Neue Wunschliste</span>
          </button>
        </div>
      )}

      <Sheet open={!!sharing} onClose={() => setSharing(null)} label="Liste teilen">
        {sharing && <ShareContent list={sharing} onNavigate={() => setSharing(null)} />}
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} label="Neue Wunschliste">
        <h2>Neue Wunschliste</h2>
        <ListForm busy={busy} onSubmit={create} />
      </Sheet>
    </div>
  );
}
