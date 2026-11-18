import { useState } from "react";
import { Link } from "react-router-dom";
import { cover } from "../lib/types";
import { daysChip, dateLabel } from "../lib/format";
import { forgetGuestList, getGuestLists } from "../lib/guestLists";
import { IconChevron } from "../components/Icons";

/** Startseite für Schenkende ohne Konto: alle Wunschlisten, die auf diesem Gerät geöffnet wurden. */
export function GuestHome() {
  const [lists, setLists] = useState(getGuestLists);
  const remove = (token: string) => { forgetGuestList(token); setLists(getGuestLists()); };

  return (
    <div className="wrap narrow">
      <h1>Deine Wunschlisten</h1>
      <p className="lead">Alle Wunschlisten, die du auf diesem Gerät geöffnet hast. Tippe eine an, um zu schauen oder etwas zu reservieren.</p>
      {lists.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          <p>Noch keine Wunschliste. Öffne einmal den Link, den du bekommen hast, dann erscheint sie hier.</p>
        </div>
      ) : (
        <div className="list-rows" style={{ marginTop: 18 }}>
          {lists.map((l) => {
            const c = cover(l.cover);
            const d = daysChip(l.event_date);
            return (
              <div className="guest-home-row" key={l.token}>
                <Link className="list-row" to={`/w/${l.token}`}>
                  <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                  <span className="list-text">
                    <span className="list-title">{l.title}</span>
                    <span className="list-meta">
                      {[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}
                      {d && <span className={`days-chip ${d.soon ? "soon" : ""}`}>{d.text}</span>}
                    </span>
                  </span>
                  <span className="list-chev" aria-hidden="true"><IconChevron /></span>
                </Link>
                <button type="button" className="guest-home-x" aria-label={`„${l.title}“ aus dieser Übersicht entfernen`} onClick={() => remove(l.token)}>×</button>
              </div>
            );
          })}
        </div>
      )}
      <p className="hint" style={{ marginTop: 26 }}>
        Du verwaltest selbst Wunschlisten? <Link to="/anmelden">Hier anmelden</Link>
      </p>
    </div>
  );
}
