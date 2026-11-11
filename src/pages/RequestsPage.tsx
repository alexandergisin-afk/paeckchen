import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { friendlyError, toast } from "../lib/format";
import { IconBack } from "../components/Icons";

interface Request { id: string; email: string; created_at: string; invited_by_name: string | null; list_title: string | null }

/** Für Administratoren: neue Bearbeiter freigeben oder ablehnen. Erst die Freigabe verschickt die Code-Mail. */
export function RequestsPage() {
  const [items, setItems] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db().rpc("pending_access_requests");
    if (error) return setError(/forbidden|42501/.test(error.message) ? "Diese Seite ist nur für Administratoren." : friendlyError(error));
    setItems(data as Request[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: Request, approve: boolean) => {
    setBusyId(r.id);
    const { data, error } = await db().functions.invoke("zugang", { body: { action: "decide", id: r.id, approve } });
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
      <p className="lead">Neue Bearbeiter bekommen ihre Mail mit dem Anmeldecode erst, wenn du sie hier freigibst.</p>
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
