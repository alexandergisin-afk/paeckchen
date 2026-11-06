import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { db } from "./supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  displayName: string;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, displayName: "" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

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
    if (!session) return setDisplayName("");
    db()
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? session.user.email?.split("@")[0] ?? ""));
  }, [session]);

  return <AuthContext.Provider value={{ session, loading, displayName }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
