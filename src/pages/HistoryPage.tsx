import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { friendlyError } from "../lib/format";
import { dayLabel, describe, type AuditEntry } from "../lib/history";
import { IconBack, IconEdit, IconGift, IconUsers } from "../components/Icons";
import { SkeletonRows } from "../components/Skeleton";

const PAGE = 50;
const ICON = { list: IconEdit, wish: IconEdit, reservation: IconGift, member: IconUsers, access: IconUsers } as const;

/**
 * Verlauf einer Liste (für Mitglieder) oder Sicherheitsprotokoll (für Administratoren).
 * Was jemand sehen darf, entscheidet die Datenbank: z. B. keine Reservierungen bei ausgeblendetem „Anzeigen“.
 */
export function HistoryPage({ mode }: { mode: "list" | "access" }) {
  const { id } = useParams();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [title, setTitle] = useState<string>("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (before?: string) => {
    let qy = db().from("audit_log").select("id,at,kind,action,actor_name,data").order("at", { ascending: false }).order("id", { ascending: false }).limit(PAGE);
    qy = mode === "list" ? qy.eq("list_id", id!) : qy.eq("kind", "access");
    if (before) qy = qy.lt("at", before);
    const { data, error } = await qy;
    if (error) throw error;
    return data as AuditEntry[];
  }, [id, mode]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchPage();
        setEntries(rows);
        setMore(rows.length === PAGE);
        if (mode === "list") {
          const { data } = await db().from("lists").select("title").eq("id", id!).maybeSingle();
          setTitle(data?.title ?? "");
        }
      } catch (e) {
        setError(friendlyError(e));
      }
    })();
  }, [fetchPage, id, mode]);

  const loadMore = async () => {
    if (!entries?.length) return;
    setBusy(true);
    try {
      const rows = await fetchPage(entries[entries.length - 1].at);
      setEntries([...entries, ...rows]);
      setMore(rows.length === PAGE);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // nach Tagen gruppieren
  const groups: { day: string; items: AuditEntry[] }[] = [];
  for (const e of entries ?? []) {
    const day = dayLabel(e.at);
    if (groups[groups.length - 1]?.day === day) groups[groups.length - 1].items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="wrap narrow">
      {mode === "list"
        ? <Link className="back" to={`/liste/${id}`}><IconBack /> Zur Liste</Link>
        : <Link className="back" to="/einstellungen"><IconBack /> Einstellungen</Link>}
      <h1>{mode === "list" ? "Verlauf" : "Sicherheitsprotokoll"}</h1>
      <p className="lead">
        {mode === "list"
          ? <>Wer was in {title ? <b>„{title}“</b> : "dieser Liste"} geändert hat. Reservierungen erscheinen nur, wenn du sie dir anzeigen lässt.</>
          : "Wer wann Zugang angefragt, bekommen oder verloren hat."}
      </p>
      {error && <p className="notice error mt-16">{error}</p>}
      {!entries && !error && <SkeletonRows count={4} label="Verlauf wird geladen" />}
      {entries && entries.length === 0 && <div className="empty mt-18"><p>Noch keine Einträge.</p></div>}
      {groups.map((g) => (
        <section key={g.day} className="history-day" aria-label={g.day}>
          <h2 className="settings-group">{g.day}</h2>
          <ol className="history">
            {g.items.map((e) => {
              const Icon = ICON[e.kind] ?? IconEdit;
              return (
                <li key={e.id} className={`history-item k-${e.kind}`}>
                  <span className="history-icon" aria-hidden="true"><Icon /></span>
                  <span className="history-text">{describe(e)}</span>
                  <time className="history-time" dateTime={e.at}>{new Date(e.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {more && <button className="btn soft block mt-16" disabled={busy} onClick={loadMore}>{busy ? "Wird geladen …" : "Ältere Einträge laden"}</button>}
      {entries && entries.length > 0 && !more && (
        <p className="hint mt-18">
          {mode === "list" ? "Einträge werden nach einem Jahr gelöscht, solche mit Namen von Gästen schon 60 Tage nach dem Anlass." : "Einträge werden nach einem Jahr gelöscht."}
        </p>
      )}
    </div>
  );
}
