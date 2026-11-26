import { useCallback, useEffect, useState, type FormEvent } from "react";
import { db } from "../lib/supabase";
import { friendlyError, toast, toastError } from "../lib/format";

interface Follower { user_id: string; display_name: string; source: "link" | "family"; created_at: string }

/**
 * Schenkende mit Konto, die diese Liste gespeichert haben (über den Link oder von euch freigegeben).
 * Sie sehen nur die Gästeansicht: keine Namen anderer Schenkender, kein Bearbeiten.
 */
export function FollowersPanel({ listId }: { listId: string }) {
  const [items, setItems] = useState<Follower[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db().rpc("list_followers_of", { p_list: listId });
    if (!error) setItems((data ?? []) as Follower[]);
  }, [listId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setNote(null);
    const { data, error } = await db().rpc("add_follower", { p_list: listId, p_email: email.trim() });
    setBusy(false);
    if (error) return toastError(friendlyError(error));
    const r = data as { status: string; name?: string };
    if (r.status === "added") { toast(`${r.name} sieht die Liste jetzt im eigenen Konto.`); setEmail(""); load(); }
    else if (r.status === "member") setNote(`${r.name} bearbeitet diese Liste schon mit.`);
    else setNote("Zu dieser Adresse gibt es noch kein Konto. Schick der Person einfach den Link für Schenkende, das genügt zum Reservieren.");
  };

  const remove = async (f: Follower) => {
    const { error } = await db().from("list_followers").delete().eq("list_id", listId).eq("user_id", f.user_id);
    if (error) return toastError(friendlyError(error));
    toast(`${f.display_name} hat die Liste nicht mehr im Konto.`);
    load();
  };

  return (
    <section className="panel" aria-label="Schenkende mit Konto">
      <h2>Schenkende mit Konto</h2>
      <p className="hint mt-6">
        Sie haben die Liste in ihrer Übersicht und sehen sie wie Gäste: ohne Namen anderer Schenkender, ohne Bearbeiten.
      </p>
      {items && items.length === 0 && <p className="hint mt-10">Noch niemand.</p>}
      {items && items.length > 0 && (
        <ul className="follower-list">
          {items.map((f) => (
            <li key={f.user_id}>
              <span>
                <b>{f.display_name}</b>
                <small>{f.source === "family" ? "von euch freigegeben" : "über den Link gespeichert"}</small>
              </span>
              <button type="button" className="btn quiet small" onClick={() => remove(f)} aria-label={`${f.display_name} entfernen`}>Entfernen</button>
            </li>
          ))}
        </ul>
      )}
      <form className="follower-add" onSubmit={add}>
        <label className="field">
          <span>Konto per E-Mail hinzufügen</span>
          <input type="email" inputMode="email" autoComplete="off" placeholder="name@beispiel.de" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn soft" disabled={busy || !email.trim()}>Hinzufügen</button>
      </form>
      {note && <p className="notice mt-10">{note}</p>}
      <p className="hint mt-12">
        Entfernen nimmt die Liste nur aus der Übersicht der Person. Wer den Link kennt, kann sie weiterhin öffnen.
        Soll jemand gar keinen Zugang mehr haben, erneuert den Link für Schenkende.
      </p>
    </section>
  );
}
