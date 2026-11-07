import { useEffect, useState, type FormEvent } from "react";
import { canPrompt, isInstalled, isIOS, onInstallChange, promptInstall } from "../lib/install";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyError, toast } from "../lib/format";
import { getLargeText, setLargeText } from "../lib/device";
import { IconLogout } from "../components/Icons";

export function Settings() {
  const { session, displayName, refreshProfile } = useAuth();
  const [name, setNameValue] = useState(displayName);
  const [large, setLarge] = useState(getLargeText());
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(canPrompt());
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

  const toggle = (on: boolean) => {
    setLargeText(on);
    setLarge(on);
  };

  return (
    <div className="wrap narrow">
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
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Darstellung</h2>
          <div className="chips">
            <button className="fchip" aria-pressed={!large} onClick={() => toggle(false)}>Normale Schrift</button>
            <button className="fchip" aria-pressed={large} onClick={() => toggle(true)}>Große Schrift</button>
          </div>
        </section>
        <section className="panel">
          <h2>Als App auf dem Startbildschirm</h2>
          {isInstalled() ? (
            <p className="hint" style={{ marginTop: 6 }}>Päckchen ist auf diesem Gerät bereits als App installiert.</p>
          ) : installable ? (
            <>
              <p className="hint" style={{ margin: "6px 0 12px" }}>Dann öffnest du Päckchen mit einem Tipp, ohne Browserleiste.</p>
              <button className="btn" onClick={promptInstall}>App installieren</button>
            </>
          ) : isIOS() ? (
            <p className="hint" style={{ marginTop: 6 }}>
              Öffne Päckchen in <b>Safari</b>, tippe unten auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil) und dann auf <b>„Zum Home-Bildschirm“</b>.
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
          <button className="btn soft" onClick={() => db().auth.signOut()}><IconLogout /> Abmelden</button>
        </section>
      </div>
    </div>
  );
}
