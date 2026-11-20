import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { friendlyError, toast } from "../lib/format";
import { IconBack } from "../components/Icons";

interface Request { id: string; email: string; created_at: string; invited_by_name: string | null; list_title: string | null; list_id?: string | null }
interface MyList { id: string; title: string }

/** Für Administratoren: neue Bearbeiter freigeben oder ablehnen. Erst die Freigabe verschickt die Code-Mail. */
export function RequestsPage() {
  const [items, setItems] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Eigene aktive Listen zum Zuweisen (nur Listen, bei denen man selbst Mitglied ist)
  const [myLists, setMyLists] = useState<MyList[]>([]);
  useEffect(() => {
    db().from("lists").select("id,title").is("archived_at", null).order("title").then(({ data }) => setMyLists((data ?? []) as MyList[]));
  }, []);
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const assignedOf = (r: Request) => assign[r.id] ?? (r.list_id ? [r.list_id] : []);
  const toggle = (r: Request, listId: string) => {
    const cur = assignedOf(r);
    setAssign({ ...assign, [r.id]: cur.includes(listId) ? cur.filter((x) => x !== listId) : [...cur, listId] });
  };

  const load = useCallback(async () => {
    const { data, error } = await db().rpc("pending_access_requests");
    if (error) return setError(/forbidden|42501/.test(error.message) ? "Diese Seite ist nur für Administratoren." : friendlyError(error));
    setItems(data as Request[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Kontoart pro Anfrage: ohne Einladung zum Schenken, eingeladen zum Mitbearbeiten als Familie
  const [types, setTypes] = useState<Record<string, "guest" | "family">>({});
  const typeOf = (r: Request) => types[r.id] ?? (r.invited_by_name ? "family" : "guest");

  const decide = async (r: Request, approve: boolean) => {
    setBusyId(r.id);
    const { data, error } = await db().functions.invoke("zugang", { body: { action: "decide", id: r.id, approve, type: typeOf(r), lists: approve ? assignedOf(r) : [] } });
    setBusyId(null);
    const res = data as { ok?: boolean; mail_sent?: boolean } | null;
    if (error || !res?.ok) return toast("Das hat gerade nicht geklappt. Bitte versuch es noch einmal.");
    toast(approve
      ? res.mail_sent ? `${r.email} ist freigegeben und bekommt jetzt die Mail mit dem Code.` : `${r.email} ist freigegeben. Die Mail konnte nicht verschickt werden, die Person kann sich aber jetzt selbst anmelden.`
      : `Anfrage von ${r.email} abgelehnt.`);
    load();
  };

  return (
    <div className="wrap narrow">
      <Link className="back" to="/einstellungen"><IconBack /> Einstellungen</Link>
      <h1>Zugangsanfragen</h1>
      <p className="lead">Neue Konten bekommen ihre Mail mit dem Anmeldecode erst, wenn du sie hier freigibst. Zum Reservieren braucht niemand ein Konto, der Link zur Wunschliste genügt.</p>
      {error && <p className="notice error" style={{ marginTop: 16 }}>{error}</p>}
      {!items && !error && <p className="loading">Wird geladen …</p>}
      {items && items.length === 0 && <div className="empty" style={{ marginTop: 18 }}><p>Keine offenen Anfragen.</p></div>}
      {items && items.length > 0 && (
        <div className="stack" style={{ marginTop: 18 }}>
          {items.map((r) => (
            <section className="panel request" key={r.id}>
              <b className="request-email">{r.email}</b>
              <p className="hint" style={{ margin: "4px 0 12px" }}>
                {r.invited_by_name ? `Eingeladen von ${r.invited_by_name}${r.list_title ? ` zu „${r.list_title}“` : ""}` : "Hat sich ohne Einladung angemeldet"}
                {", "}{new Date(r.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
              </p>
              <fieldset className="type-choice">
                <legend>Freigeben als</legend>
                <label><input type="radio" name={`typ-${r.id}`} checked={typeOf(r) === "guest"} onChange={() => setTypes({ ...types, [r.id]: "guest" })} />
                  <span><b>Zum Schenken</b><small>sieht freigegebene Wunschlisten, legt keine eigenen an</small></span></label>
                <label><input type="radio" name={`typ-${r.id}`} checked={typeOf(r) === "family"} onChange={() => setTypes({ ...types, [r.id]: "family" })} />
                  <span><b>Familie</b><small>darf eigene Listen anlegen und mitbearbeiten</small></span></label>
              </fieldset>
              {myLists.length > 0 && (
                <fieldset className="assign-lists">
                  <legend>{typeOf(r) === "family" ? "Als Mitbearbeiter hinzufügen zu" : "Diese Wunschlisten zum Schenken freigeben"}</legend>
                  {myLists.map((l) => (
                    <label key={l.id}>
                      <input type="checkbox" checked={assignedOf(r).includes(l.id)} onChange={() => toggle(r, l.id)} />
                      <span>{l.title}</span>
                    </label>
                  ))}
                  <small className="hint">
                    {typeOf(r) === "family"
                      ? "Mitbearbeiter können Wünsche ändern und Reservierungen sehen."
                      : "Die Listen erscheinen nach der ersten Anmeldung in der Übersicht. Freigeben kannst du später auch in der Liste unter „Mitglieder“."}
                  </small>
                </fieldset>
              )}
              <div className="toolbar">
                <button className="btn" disabled={busyId === r.id} onClick={() => decide(r, true)}>Freigeben</button>
                <button className="btn soft" disabled={busyId === r.id} onClick={() => decide(r, false)}>Ablehnen</button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
