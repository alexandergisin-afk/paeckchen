import { Link, useLocation } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { IconLogout, Logo } from "./Icons";

export function TopBar() {
  const { session } = useAuth();
  const guestView = useLocation().pathname.startsWith("/w/");
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
            <button className="btn quiet" onClick={() => db().auth.signOut()}><IconLogout /> Abmelden</button>
          </div>
        )}
      </div>
    </header>
  );
}
