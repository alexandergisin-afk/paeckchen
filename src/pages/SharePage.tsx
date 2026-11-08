import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { cover } from "../lib/types";
import { clearShare, firstUrl, pendingShare, rememberShare } from "../lib/share";
import { friendlyError, toast } from "../lib/format";
import { IconBack, IconChevron } from "../components/Icons";

interface Row { id: string; title: string; cover: number; archived_at: string | null }

/** Ziel für geteilte Links: Liste auswählen, dann öffnet sich „Neuer Wunsch“ mit dem Link. */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<Row[] | null>(null);

  useEffect(() => {
    const fromQuery = firstUrl(params.get("url"), params.get("text"));
    if (fromQuery) rememberShare(fromQuery);
    setUrl(fromQuery ?? pendingShare());
    db().from("lists").select("id,title,cover,archived_at").is("archived_at", null).order("created_at", { ascending: false })
      .then(({ data, error }) => (error ? toast(friendlyError(error)) : setLists(data as Row[])));
  }, [params]);

  const pick = (id: string) => {
    if (!url) return;
    clearShare();
    navigate(`/liste/${id}?neu=${encodeURIComponent(url)}`, { replace: true });
  };

  let host = "";
  try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* egal */ }

  return (
    <div className="wrap narrow">
      <Link className="back" to="/" onClick={clearShare}><IconBack /> Abbrechen</Link>
      <h1>Wunsch hinzufügen</h1>
      {!url ? (
        <p className="lead">Es wurde kein Link übergeben. Teile ein Produkt aus einer Shop-App oder dem Browser mit Päckli.</p>
      ) : (
        <>
          <p className="lead">In welche Liste soll der Link von <b>{host || "diesem Shop"}</b>?</p>
          {!lists ? <p className="loading">Listen werden geladen …</p> : lists.length === 0 ? (
            <div className="empty" style={{ marginTop: 18 }}><p>Du hast noch keine Liste. Leg zuerst eine an.</p><Link className="btn" to="/">Zu meinen Listen</Link></div>
          ) : (
            <div className="list-rows" style={{ marginTop: 18 }}>
              {lists.map((l) => {
                const c = cover(l.cover);
                return (
                  <button key={l.id} className="list-row" onClick={() => pick(l.id)} style={{ border: 0, font: "inherit", textAlign: "left", cursor: "pointer" }}>
                    <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                    <span className="list-text"><span className="list-title">{l.title}</span></span>
                    <span className="list-chev" aria-hidden="true"><IconChevron /></span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
