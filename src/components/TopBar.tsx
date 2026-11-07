import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getLargeText, setLargeText } from "../lib/device";
import { Logo } from "./Icons";

export function TopBar() {
  const { session, displayName } = useAuth();
  const path = useLocation().pathname;
  const guestView = path.startsWith("/w/");
  const [large, setLarge] = useState(getLargeText());
  // Die Listenseite hat ihre eigene Leiste mit „Zurück“ und „Bearbeiten“.
  if (/^\/liste\/[^/]+$/.test(path)) return null;
  const initial = (displayName || session?.user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <header className="top">
      <div className="top-in">
        {guestView && !session ? (
          <span className="brand"><Logo />Päckli</span>
        ) : (
          <Link className="brand" to="/"><Logo />Päckli</Link>
        )}
        {guestView ? (
          <button
            className="fchip textsize" aria-pressed={large} aria-label="Größere Schrift"
            onClick={() => { setLargeText(!large); setLarge(!large); }}
          >A+</button>
        ) : session ? (
          <Link className="me-btn" to="/einstellungen" aria-label="Einstellungen und Profil" title="Einstellungen"
            aria-current={path === "/einstellungen" ? "page" : undefined}>
            <span className="me-avatar" aria-hidden="true">{initial}</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
