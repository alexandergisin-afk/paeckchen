import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./lib/auth";
import { TopBar } from "./components/TopBar";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ListPage } from "./pages/ListPage";
import { GuestPage } from "./pages/GuestPage";

/** Eltern-Bereich: nur mit Anmeldung. */
function RequireAuth({ children, linkError }: { children: ReactNode; linkError: string | null }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="loading">Einen Moment …</p>;
  if (!session) return <Login linkError={linkError} />;
  return <>{children}</>;
}

export function App({ linkError }: { linkError: string | null }) {
  if (!isConfigured) return <Setup />;
  const parent = (el: ReactNode) => <RequireAuth linkError={linkError}>{el}</RequireAuth>;
  return (
    <HashRouter>
      <AuthProvider>
        <TopBar />
        <main id="app">
          <Routes>
            {/* Gästeansicht: ohne Anmeldung */}
            <Route path="/w/:token" element={<GuestPage />} />
            <Route path="/" element={parent(<Dashboard />)} />
            <Route path="/liste/:id" element={parent(<ListPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </HashRouter>
  );
}
