import { useEffect, useState, type FormEvent } from "react";
import { canPrompt, isInstalled, isIOS, onInstallChange, promptInstall } from "../lib/install";
import { appUrl, db } from "../lib/supabase";
import { clearCache } from "../lib/cache";
import { useAuth } from "../lib/auth";
import { friendlyError, toast } from "../lib/format";
import { IconBack, IconChevron, IconLogout, IconMail, IconUsers } from "../components/Icons";
import { Link } from "react-router-dom";

export function Settings() {
  const { session, displayName, refreshProfile } = useAuth();
  const [name, setNameValue] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(canPrompt());
  const [reminders, setReminders] = useState<boolean | null>(null);
  // Nur Administratoren sehen die Zugangsanfragen (null = kein Administrator)
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!session) return;
    db().from("app_admins").select("user_id").eq("user_id", session.user.id).maybeSingle().then(async ({ data }) => {
      if (!data) return;
      const { data: rows } = await db().rpc("pending_access_requests");
      setPendingCount(Array.isArray(rows) ? rows.length : 0);
    });
  }, [session]);
  const [notify, setNotify] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const shortcutUrl = `${appUrl()}#/teilen?url=`;

  useEffect(() => {
    if (!session) return;
    db().from("profiles").select("reminder_emails,notify_reservations").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => { setReminders(data?.reminder_emails ?? true); setNotify((data?.notify_reservations ?? "daily") !== "off"); });
  }, [session]);

  const toggleNotify = async (on: boolean) => {
    setNotify(on);
    const { error } = await db().from("profiles").update({ notify_reservations: on ? "daily" : "off" }).eq("id", session!.user.id);
    if (error) { setNotify(!on); return toast(friendlyError(error)); }
    toast(on ? "Du bekommst morgens eine Zusammenfassung." : "Keine Mails mehr bei Reservierungen.");
  };

  const toggleReminders = async (on: boolean) => {
    setReminders(on);
    const { error } = await db().from("profiles").update({ reminder_emails: on }).eq("id", session!.user.id);
    if (error) { setReminders(!on); return toast(friendlyError(error)); }
    toast(on ? "Erinnerungen sind an." : "Erinnerungen sind aus.");
  };
  useEffect(() => onInstallChange(() => setInstallable(canPrompt())), []);

  useEffect(() => setNameValue(displayName), [displayName]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { error } = await db().from("profiles").update({ display_name: n.slice(0, 60) }).eq("id", session!.user.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    refreshProfile();
    toast("Name gespeichert.");
  };


  return (
    <div className="wrap narrow">
      <Link className="back" to="/"><IconBack /> Listen</Link>
      <h1>Einstellungen</h1>
      <div className="stack" style={{ marginTop: 22 }}>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Dein Name</h2>
          <form onSubmit={save}>
            <label className="field">
              <span>So sehen dich andere Mitglieder deiner Listen</span>
              <input required maxLength={60} value={name} onChange={(e) => setNameValue(e.target.value)} />
            </label>
            <button className="btn small" type="submit" disabled={busy}>Name speichern</button>
          </form>
          <p className="hint" style={{ marginTop: 14 }}>Angemeldet als {session?.user.email}</p>
        </section>
        {pendingCount !== null && (
          <Link className="panel settings-link" to="/einstellungen/anfragen">
            <span className="settings-link-icon" aria-hidden="true"><IconMail /></span>
            <span><b>Zugangsanfragen</b>{pendingCount > 0 && <span className="count-badge">{pendingCount}</span>}<span className="hint" style={{ display: "block" }}>{pendingCount > 0 ? "Neue Bearbeiter warten auf deine Freigabe" : "Keine offenen Anfragen"}</span></span>
            <span className="list-chev" aria-hidden="true"><IconChevron /></span>
          </Link>
        )}
        <Link className="panel settings-link" to="/einstellungen/zugriff">
          <span className="settings-link-icon" aria-hidden="true"><IconUsers /></span>
          <span><b>Zugriff verwalten</b><span className="hint" style={{ display: "block" }}>Wer welche Listen mitbearbeiten darf und was jede Rolle darf</span></span>
          <span className="list-chev" aria-hidden="true"><IconChevron /></span>
        </Link>
        <section className="panel">
          <label className="switch">
            <input type="checkbox" checked={notify ?? true} disabled={notify === null} onChange={(e) => toggleNotify(e.target.checked)} />
            <span><b>Neue Reservierungen per Mail</b><br /><span className="hint">Einmal täglich morgens eine Zusammenfassung, wer was reserviert hat. Listen, bei denen du Reservierungen ausgeblendet hast, sind ausgenommen.</span></span>
          </label>
        </section>
        <section className="panel">
          <label className="switch">
            <input type="checkbox" checked={reminders ?? true} disabled={reminders === null} onChange={(e) => toggleReminders(e.target.checked)} />
            <span><b>Erinnerungs-Mails</b><br /><span className="hint">Zwei Wochen und drei Tage vor jedem Anlass eine kurze Mail mit dem aktuellen Stand.</span></span>
          </label>
        </section>
        <section className="panel">
          <h2>Wünsche aus anderen Apps teilen</h2>
          <p className="hint" style={{ marginTop: 6 }}>
            <b>Android:</b> Lege Päckli als App auf den Startbildschirm (siehe unten). Danach erscheint Päckli im Teilen-Menü jeder Shop-App.
          </p>
          <p className="hint" style={{ marginTop: 10 }}>
            <b>iPhone:</b> Einmalig einen Kurzbefehl anlegen: In der App <b>Kurzbefehle</b> einen neuen Kurzbefehl erstellen, in den Details <b>„Im Share-Sheet anzeigen“</b> einschalten
            und als Eingabe <b>URLs</b> wählen. Dann die Aktion <b>„URLs öffnen“</b> hinzufügen und dort diese Adresse eintragen, direkt gefolgt von der Variable <b>„Kurzbefehleingabe“</b>:
          </p>
          <div className="linkbox"><code>{shortcutUrl}</code>
            <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(shortcutUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* egal */ } }}>{copied ? "Kopiert ✓" : "Kopieren"}</button>
          </div>
          <p className="hint">Den Kurzbefehl z. B. „Zu Päckli“ nennen. Er öffnet Päckli in Safari, dort musst du angemeldet sein.</p>
        </section>
        <section className="panel">
          <h2>Als App auf dem Startbildschirm</h2>
          {isInstalled() ? (
            <p className="hint" style={{ marginTop: 6 }}>Päckli ist auf diesem Gerät bereits als App installiert.</p>
          ) : installable ? (
            <>
              <p className="hint" style={{ margin: "6px 0 12px" }}>Dann öffnest du Päckli mit einem Tipp, ohne Browserleiste.</p>
              <button className="btn" onClick={promptInstall}>App installieren</button>
            </>
          ) : isIOS() ? (
            <p className="hint" style={{ marginTop: 6 }}>
              Öffne Päckli in <b>Safari</b>, tippe unten auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil) und dann auf <b>„Zum Home-Bildschirm“</b>.
              Zum Anmelden in der App gibst du am besten den Code aus der Mail ein.
            </p>
          ) : (
            <p className="hint" style={{ marginTop: 6 }}>
              Öffne im Browser-Menü (⋮) den Punkt <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b>.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Datenschutz</h2>
          <p className="hint" style={{ marginTop: 6 }}>
            Von dir speichern wir deine E-Mail-Adresse und deinen Namen. Von Schenkenden nur den Namen, den sie beim Reservieren angeben.
            Andere Gäste sehen keine Namen, und eure E-Mail-Adressen sieht niemand außer euch selbst.
          </p>
        </section>
        <section className="panel">
          <button className="btn soft" onClick={() => { clearCache(); db().auth.signOut(); }}><IconLogout /> Abmelden</button>
        </section>
      </div>
    </div>
  );
}
