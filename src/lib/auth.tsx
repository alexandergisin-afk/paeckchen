import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { db } from "./supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  displayName: string;
  /** "family" darf Listen anlegen, "guest" (Schenkende) nicht; null solange unbekannt */
  accountType: "family" | "guest" | null;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, displayName: "", accountType: null, refreshProfile: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"family" | "guest" | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    const client = db();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
      // Anmeldecode aus der Adresse entfernen, damit er nicht in Lesezeichen landet.
      if (s && window.location.search.includes("code=")) {
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAccountType(null); return setDisplayName(""); }
    db()
      .from("profiles")
      .select("display_name,account_type")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? session.user.email?.split("@")[0] ?? "");
        // Ältere Datenbank ohne Kontoarten: wie bisher Familie
        setAccountType(data?.account_type === "guest" ? "guest" : "family");
      });
  }, [session, profileVersion]);

  return <AuthContext.Provider value={{ session, loading, displayName, accountType, refreshProfile: () => setProfileVersion((v) => v + 1) }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
