import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { IconLogout, Logo } from "./Icons";

export function TopBar() {
  const { session } = useAuth();
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" to="/">
          <Logo />
          Päckchen
        </Link>
        {session && (
          <div className="userbox">
            <button className="btn quiet" onClick={() => db().auth.signOut()}>
              <IconLogout /> Abmelden
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
