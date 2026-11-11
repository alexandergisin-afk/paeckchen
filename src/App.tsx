import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./lib/auth";
import { TopBar } from "./components/TopBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";

// Seiten werden erst geladen, wenn man sie öffnet: Gäste laden so nur die Gästeansicht.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const ListPage = lazy(() => import("./pages/ListPage").then((m) => ({ default: m.ListPage })));
const GuestPage = lazy(() => import("./pages/GuestPage").then((m) => ({ default: m.GuestPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));
const RequestsPage = lazy(() => import("./pages/RequestsPage").then((m) => ({ default: m.RequestsPage })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const AccessPage = lazy(() => import("./pages/AccessPage").then((m) => ({ default: m.AccessPage })));
const SharePage = lazy(() => import("./pages/SharePage").then((m) => ({ default: m.SharePage })));
const StatsPage = lazy(() => import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })));

/** Seltenere Seiten im Leerlauf vorladen, damit der Wechsel dorthin sofort geht (nicht für Gäste). */
function prefetchPages() {
  if (window.location.hash.startsWith("#/w/")) return;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => {
    void import("./pages/Settings");
    void import("./pages/StatsPage");
    void import("./pages/TeamPage");
    void import("./pages/AccessPage");
    void import("./pages/SharePage");
    void import("./pages/RequestsPage");
  });
}
if (typeof window !== "undefined") window.addEventListener("load", prefetchPages, { once: true });

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
        <OfflineBanner />
        <main id="app">
          <ErrorBoundary>
          <Suspense fallback={<p className="loading">Einen Moment …</p>}>
          <Routes>
            {/* Gästeansicht: ohne Anmeldung */}
            <Route path="/w/:token" element={<GuestPage />} />
            <Route path="/" element={parent(<Dashboard />)} />
            <Route path="/liste/:id" element={parent(<ListPage />)} />
            <Route path="/liste/:id/mitglieder" element={parent(<TeamPage />)} />
            <Route path="/einladung/:token" element={parent(<InvitePage />)} />
            <Route path="/einstellungen" element={parent(<Settings />)} />
            <Route path="/einstellungen/zugriff" element={parent(<AccessPage />)} />
            <Route path="/einstellungen/anfragen" element={parent(<RequestsPage />)} />
            <Route path="/teilen" element={parent(<SharePage />)} />
            <Route path="/statistik" element={parent(<StatsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </AuthProvider>
    </HashRouter>
  );
}
