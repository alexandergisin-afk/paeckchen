import { useState } from "react";
import { Link } from "react-router-dom";
import { forgetGuestList, getGuestLists } from "../lib/guestLists";
import { RemovableListRow } from "../components/ListRow";

/** Startseite für Schenkende ohne Konto: alle Wunschlisten, die auf diesem Gerät geöffnet wurden. */
export function GuestHome() {
  return (
    <div className="wrap narrow">
      <h1>Deine Wunschlisten</h1>
      <p className="lead">Alle Wunschlisten, die du auf diesem Gerät geöffnet hast. Tippe eine an, um zu schauen oder etwas zu reservieren.</p>
      <VisitedLists />
      <section className="account-hint" aria-label="Mit Konto schenken">
        <p><b>Mit einem Konto</b> hast du diese Wunschlisten und deine Geschenke auf allen Geräten.</p>
        <Link className="btn soft" to="/anmelden">Anmelden oder Konto anlegen</Link>
      </section>
    </div>
  );
}

/** Die auf diesem Gerät geöffneten Wunschlisten, einzeln entfernbar (auch in der Übersicht von Schenkendenkonten). */
export function VisitedLists() {
  const [lists, setLists] = useState(getGuestLists);
  const remove = (token: string) => { forgetGuestList(token); setLists(getGuestLists()); };
  return (
    <>
      {lists.length === 0 ? (
        <div className="empty mt-18">
          <p>Noch keine Wunschliste. Öffne einmal den Link, den du bekommen hast, dann erscheint sie hier.</p>
        </div>
      ) : (
        <div className="list-rows mt-18">
          {lists.map((l) => (
            <RemovableListRow key={l.token} to={`/w/${l.token}`} list={l}
              removeLabel={`„${l.title}“ aus dieser Übersicht entfernen`} onRemove={() => remove(l.token)} />
          ))}
        </div>
      )}
    </>
  );
}
