import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./lib/auth";
import { TopBar } from "./components/TopBar";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ListPage } from "./pages/ListPage";
import { GuestPage } from "./pages/GuestPage";
import { TeamPage } from "./pages/TeamPage";
import { InvitePage } from "./pages/InvitePage";
import { Settings } from "./pages/Settings";

export const PENDING_INVITE = "paeckchen-pending-invite";

/**
 * Eltern-Bereich: nur mit Anmeldung.
 * Wer eine Einladung öffnet und noch nicht angemeldet ist, landet nach dem Anmeldelink
 * auf der Startseite. Deshalb merken wir uns die Einladung und führen danach dorthin zurück.
 */
function RequireAuth({ children, linkError }: { children: ReactNode; linkError: string | null }) {
  const { session, loading } = useAuth();
  const path = useLocation().pathname;
  if (loading) return <p className="loading">Einen Moment …</p>;
  if (!session) {
    if (path.startsWith("/einladung/")) {
      try { localStorage.setItem(PENDING_INVITE, path.slice("/einladung/".length)); } catch { /* egal */ }
    }
    return <Login linkError={linkError} invite={path.startsWith("/einladung/")} />;
  }
  let pending: string | null = null;
  try { pending = localStorage.getItem(PENDING_INVITE); } catch { /* egal */ }
  // Aufgeräumt wird in InvitePage, damit das Rendern frei von Nebenwirkungen bleibt.
  if (pending && !path.startsWith("/einladung/")) return <Navigate to={`/einladung/${pending}`} replace />;
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
            <Route path="/liste/:id/mitglieder" element={parent(<TeamPage />)} />
            <Route path="/einladung/:token" element={parent(<InvitePage />)} />
            <Route path="/einstellungen" element={parent(<Settings />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </HashRouter>
  );
}
