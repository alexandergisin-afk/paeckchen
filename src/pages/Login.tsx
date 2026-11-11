import { useState, type FormEvent } from "react";
import { appUrl, db } from "../lib/supabase";
import { friendlyError } from "../lib/format";
import { Logo } from "../components/Icons";

export function Login({ linkError, invite = false }: { linkError: string | null; invite?: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | "pending">("idle");
  const [error, setError] = useState<string | null>(linkError);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("sending");
    const { error } = await db().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl() } });
    if (!error) return setState("sent");
    // Noch nicht freigeschaltet: Anfrage an die Verwaltung statt Fehlermeldung
    if (/database error saving new user|signups? not allowed|signup_not_allowed/i.test(error.message)) {
      try {
        const { data } = await db().functions.invoke("zugang", { body: { action: "request", email: email.trim() } });
        const status = (data as { status?: string } | null)?.status;
        if (status === "pending") return setState("pending");
        if (status === "rate_limited") { setError("Zu viele Versuche. Bitte warte ein paar Minuten."); return setState("idle"); }
        if (status === "invalid_email") { setError("Diese E-Mail-Adresse sieht nicht richtig aus."); return setState("idle"); }
      } catch { /* unten allgemeine Meldung */ }
    }
    setError(friendlyError(error));
    setState("idle");
  };

  // Der Code aus der Mail funktioniert auf jedem Gerät, auch in der App auf dem Startbildschirm.
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("verifying");
    const { error } = await db().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
    if (error) {
      setError(/expired|invalid/i.test(error.message) ? "Der Code stimmt nicht oder ist abgelaufen. Prüf die Ziffern oder fordere eine neue Mail an." : friendlyError(error));
      setState("sent");
    }
    // Bei Erfolg meldet Supabase die neue Anmeldung, und die App zeigt sofort die Listen.
  };

  return (
    <div className="login">
      <div className="logo-big"><Logo /></div>
      {state === "pending" ? (
        <>
          <h1>Deine Anfrage ist unterwegs</h1>
          <p className="lead">
            Päckli ist nur für eingeladene Familien. Wir haben die Verwaltung gebeten, <b>{email}</b> freizugeben.
          </p>
          <p className="notice" style={{ marginTop: 16 }}>
            Sobald das passiert ist, bekommst du eine Mail mit deinem Anmeldecode. Du kannst ihn dann hier eingeben oder in der Mail auf den Knopf tippen.
          </p>
          <button className="btn block" style={{ marginTop: 18 }} onClick={() => { setState("sent"); setError(null); }}>Ich habe den Code schon</button>
          <button className="btn quiet" style={{ marginTop: 6 }} onClick={() => { setState("idle"); setCode(""); setError(null); }}>
            Andere E-Mail-Adresse verwenden
          </button>
        </>
      ) : state === "sent" || state === "verifying" ? (
        <>
          <h1>Schau in dein Postfach</h1>
          <p className="lead">
            Wir haben dir eine Mail an <b>{email}</b> geschickt. Tippe dort auf den Knopf oder gib hier den Code aus der Mail ein.
          </p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <form onSubmit={verify} style={{ marginTop: 18 }}>
            <label className="field">
              <span>Code aus der Mail</span>
              <input
                className="code-input" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" maxLength={10}
                value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus
              />
            </label>
            <button className="btn block" type="submit" disabled={state === "verifying"}>{state === "verifying" ? "Wird geprüft …" : "Anmelden"}</button>
          </form>
          <p className="hint" style={{ marginTop: 16 }}>Die Mail kann ein, zwei Minuten brauchen und landet manchmal im Spam-Ordner.</p>
          <button className="btn quiet" style={{ marginTop: 6 }} onClick={() => { setState("idle"); setCode(""); setError(null); }}>
            Andere E-Mail-Adresse verwenden
          </button>
        </>
      ) : (
        <>
          <h1>{invite ? "Du bist eingeladen" : "Willkommen bei Päckli"}</h1>
          <p className="lead">
            {invite
              ? "Melde dich mit der E-Mail-Adresse an, an die die Einladung ging. Wir schicken dir eine Mail zum Anmelden, ganz ohne Passwort. Danach geht es direkt zur Liste."
              : "Gib deine E-Mail-Adresse ein. Wir schicken dir eine Mail zum Anmelden, ganz ohne Passwort. Beim ersten Mal wird dein Konto automatisch angelegt."}
          </p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <form onSubmit={send} style={{ marginTop: 20 }}>
            <label className="field">
              <span>E-Mail-Adresse</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" />
            </label>
            <button className="btn block" type="submit" disabled={state === "sending"}>{state === "sending" ? "Wird gesendet …" : "Anmelde-Mail schicken"}</button>
          </form>
          <p className="hint" style={{ marginTop: 18 }}>Gäste brauchen kein Konto. Sie öffnen einfach den Link zu eurer Wunschliste.</p>
        </>
      )}
    </div>
  );
}
