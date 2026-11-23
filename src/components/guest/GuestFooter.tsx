import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet } from "../Sheet";
import { getGuestLists } from "../../lib/guestLists";
import { canPrompt, isInstalled, isIOS, onInstallChange, promptInstall } from "../../lib/install";
import { hasFlag, KEYS, setFlag, setItem } from "../../lib/storage";

/**
 * Ende der Gästeansicht: Hinweis „Päckli als App speichern“ (mit Anleitung), Hinweis aufs Konto
 * und der Weg zu allen Wunschlisten. Bringt seinen eigenen Zustand mit.
 */
export function GuestFooter({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [installable, setInstallable] = useState(canPrompt());
  useEffect(() => onInstallChange(() => setInstallable(canPrompt())), []);
  const [appHint, setAppHint] = useState(() => !hasFlag(KEYS.guestAppHint));
  const hideAppHint = () => { setAppHint(false); setFlag(KEYS.guestAppHint); };
  const otherLists = getGuestLists().filter((l) => l.token !== token).length;
  const [howTo, setHowTo] = useState(false);

  return (
    <>
      {/* Für Schenkende: Päckli als App und alle Wunschlisten an einem Ort */}
      {!isInstalled() && appHint && (
        <section className="app-hint" aria-label="Päckli als App">
          <button type="button" className="app-hint-x" aria-label="Hinweis ausblenden" onClick={hideAppHint}>×</button>
          <b>Päckli als App speichern</b>
          <p>Dann öffnest du diese Wunschliste mit einem Tipp vom Startbildschirm, ohne den Link zu suchen. Weitere Wunschlisten, die du öffnest, sammelt Päckli dort für dich.</p>
          {installable
            ? <button type="button" className="btn soft" onClick={() => promptInstall()}>Als App speichern</button>
            : <button type="button" className="btn soft" onClick={() => setHowTo(true)}>So geht’s</button>}
        </section>
      )}
      {!signedIn && (
        <section className="account-hint" aria-label="Mit Konto schenken">
          <p><b>Du schenkst öfter?</b> Mit einem Konto siehst du deine Wunschlisten und Geschenke auf allen Geräten.</p>
          <Link className="btn soft" to="/anmelden" onClick={() => setItem(KEYS.returnAfterLogin, `/w/${token}`)}>
            Anmelden oder Konto anlegen
          </Link>
        </section>
      )}
      {signedIn ? (
        <p className="hint mt-16 ta-center"><Link to="/">Zu deinen Wunschlisten</Link></p>
      ) : otherLists > 0 && (
        <p className="hint mt-16 ta-center">
          <Link to="/meine-listen">Alle deine Wunschlisten ({otherLists + 1})</Link>
        </p>
      )}
  
      <Sheet open={howTo} onClose={() => setHowTo(false)} label="Als App speichern">
        <h2>Päckli als App speichern</h2>
        {isIOS() ? (
          <ol className="steps">
            <li>Unten in Safari auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).</li>
            <li>Nach unten scrollen und <b>„Zum Home-Bildschirm“</b> wählen.</li>
            <li>Mit <b>„Hinzufügen“</b> bestätigen.</li>
          </ol>
        ) : (
          <ol className="steps">
            <li>Im Browser das Menü öffnen (⋮ oder ≡).</li>
            <li><b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> wählen.</li>
            <li>Bestätigen.</li>
          </ol>
        )}
        <p className="hint mt-10">Danach findest du das Päckli-Symbol auf deinem Startbildschirm. Es öffnet direkt diese Wunschliste.</p>
        <button className="btn block mt-14" onClick={() => setHowTo(false)}>Verstanden</button>
      </Sheet>
    </>
  );
}
