import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { toast } from "../lib/format";

/** Nimmt eine Einladung an. Wird nur mit Anmeldung angezeigt (siehe App.tsx). */
export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try { localStorage.removeItem("paeckchen-pending-invite"); } catch { /* egal */ }
    db().rpc("accept_invite", { p_token: token }).then(({ data, error }) => {
      if (error || !data) return setFailed(true);
      toast("Willkommen! Du kannst die Liste jetzt mitbearbeiten.");
      navigate(`/liste/${data as string}`, { replace: true });
    });
  }, [token, navigate]);

  if (!failed) return <p className="loading">Einladung wird angenommen …</p>;
  return (
    <div className="wrap narrow">
      <h1>Diese Einladung ist nicht mehr gültig.</h1>
      <p className="lead">Sie wurde schon benutzt, zurückgezogen oder ist älter als 7 Tage. Bitte frag nach einer neuen Einladung.</p>
      <p style={{ marginTop: 16 }}><Link className="btn soft" to="/">Zu meinen Listen</Link></p>
    </div>
  );
}
