import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Logo } from "./Icons";

export function TopBar() {
  const { session, displayName } = useAuth();
  const path = useLocation().pathname;
  const guestView = path.startsWith("/w/");
  const initial = (displayName || session?.user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <header className="top">
      <div className="top-in">
        {guestView && !session ? (
          <span className="brand"><Logo />Päckli</span>
        ) : (
          <Link className="brand" to="/"><Logo />Päckli</Link>
        )}
        {session && !guestView && (
          <Link
            className="me-btn"
            to="/einstellungen"
            aria-label="Einstellungen und Profil"
            aria-current={path === "/einstellungen" ? "page" : undefined}
            title="Einstellungen"
          >
            <span className="me-avatar" aria-hidden="true">{initial}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
