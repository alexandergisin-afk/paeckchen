import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { IconGear, Logo } from "./Icons";

export function TopBar() {
  const { session } = useAuth();
  const path = useLocation().pathname;
  const guestView = path.startsWith("/w/");
  return (
    <header className="top">
      <div className="top-in">
        {guestView && !session ? (
          <span className="brand"><Logo />Päckchen</span>
        ) : (
          <Link className="brand" to="/"><Logo />Päckchen</Link>
        )}
        {session && !guestView && (
          <div className="userbox">
            <Link className="btn quiet" to="/einstellungen" aria-current={path === "/einstellungen" ? "page" : undefined}>
              <IconGear /> <span className="label">Einstellungen</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
