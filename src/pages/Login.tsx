import { useState, type FormEvent } from "react";
import { appUrl, db } from "../lib/supabase";
import { friendlyError } from "../lib/format";
import { Logo } from "../components/Icons";

export function Login({ linkError, invite = false }: { linkError: string | null; invite?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(linkError);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("sending");
    const { error } = await db().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl() },
    });
    if (error) {
      setError(friendlyError(error));
      setState("idle");
    } else setState("sent");
  };

  return (
    <div className="login">
      <div className="logo-big"><Logo /></div>
      {state === "sent" ? (
        <>
          <h1>Schau in dein Postfach</h1>
          <p className="lead">
            Wir haben einen Anmeldelink an <b>{email}</b> geschickt. Öffne ihn bitte auf diesem Gerät und in
            diesem Browser. Die Mail kann ein, zwei Minuten brauchen und landet manchmal im Spam-Ordner.
          </p>
          <button className="btn soft" style={{ marginTop: 20 }} onClick={() => setState("idle")}>
            Andere E-Mail-Adresse verwenden
          </button>
        </>
      ) : (
        <>
          <h1>{invite ? "Du bist eingeladen" : "Willkommen bei Päckchen"}</h1>
          <p className="lead">
            {invite
              ? "Melde dich mit der E-Mail-Adresse an, an die die Einladung ging. Wir schicken dir einen Link, ganz ohne Passwort. Danach geht es direkt zur Liste."
              : "Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum Anmelden, ganz ohne Passwort. Beim ersten Mal wird dein Konto automatisch angelegt."}
          </p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <form onSubmit={submit} style={{ marginTop: 20 }}>
            <label className="field">
              <span>E-Mail-Adresse</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" />
            </label>
            <button className="btn block" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Wird gesendet …" : "Anmeldelink schicken"}
            </button>
          </form>
          <p className="hint" style={{ marginTop: 18 }}>Gäste brauchen kein Konto. Sie öffnen einfach den Link zu eurer Wunschliste.</p>
        </>
      )}
    </div>
  );
}
