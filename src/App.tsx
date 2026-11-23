import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./lib/auth";
import { TopBar } from "./components/TopBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { GuestHome } from "./pages/GuestHome";
import { getGuestLists } from "./lib/guestLists";
import { getItem, KEYS, removeItem, setItem } from "./lib/storage";

// Seiten werden erst geladen, wenn man sie öffnet: Gäste laden so nur die Gästeansicht.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const ListPage = lazy(() => import("./pages/ListPage").then((m) => ({ default: m.ListPage })));
const GuestPage = lazy(() => import("./pages/GuestPage").then((m) => ({ default: m.GuestPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));
const AccountsPage = lazy(() => import("./pages/AccountsPage").then((m) => ({ default: m.AccountsPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
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
    void import("./pages/HistoryPage");
  });
}
if (typeof window !== "undefined") window.addEventListener("load", prefetchPages, { once: true });

/**
 * Wer aus einer Wunschliste heraus „Konto anlegen“ gewählt hat, landet nach der Anmeldung wieder dort,
 * egal ob per Code oder per Link aus der Mail.
 */
function ReturnAfterLogin() {
  const { session } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) return;
    try {
      const back = getItem(RETURN_AFTER_LOGIN);
      if (!back) return;
      removeItem(RETURN_AFTER_LOGIN);
      if (back.startsWith("/w/")) navigate(back, { replace: true });
    } catch { /* egal */ }
  }, [session, navigate]);
  return null;
}

/** Nach der Anmeldung: zurück zur Seite, von der man kam (z. B. eine Wunschliste), sonst zur Übersicht. */
function AfterLogin() {
  let to = "/";
  try {
    const back = getItem(RETURN_AFTER_LOGIN);
    if (back && back.startsWith("/w/")) to = back;
    removeItem(RETURN_AFTER_LOGIN);
  } catch { /* egal */ }
  return <Navigate to={to} replace />;
}
export const RETURN_AFTER_LOGIN = KEYS.returnAfterLogin;

/** Absturz-Schutz pro Seite: Wechselt man die Seite, bekommt die neue eine frische Chance. */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export const PENDING_INVITE = KEYS.pendingInvite;

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
      setItem(PENDING_INVITE, path.slice("/einladung/".length));
    }
    // Schenkende ohne Konto: Startseite mit den auf diesem Gerät geöffneten Wunschlisten
    if (path === "/" && !linkError && getGuestLists().length > 0) return <GuestHome />;
    return <Login linkError={linkError} invite={path.startsWith("/einladung/")} />;
  }
  let pending: string | null = null;
  pending = getItem(PENDING_INVITE);
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
        <ReturnAfterLogin />
        <TopBar />
        <OfflineBanner />
        <main id="app">
          <RouteErrorBoundary>
          <Suspense fallback={<p className="loading">Einen Moment …</p>}>
          <Routes>
            {/* Gästeansicht: ohne Anmeldung */}
            <Route path="/w/:token" element={<GuestPage />} />
            <Route path="/" element={parent(<Dashboard />)} />
            <Route path="/anmelden" element={parent(<AfterLogin />)} />
            <Route path="/meine-listen" element={<GuestHome />} />
            <Route path="/liste/:id" element={parent(<ListPage />)} />
            <Route path="/liste/:id/mitglieder" element={parent(<TeamPage />)} />
            <Route path="/einladung/:token" element={parent(<InvitePage />)} />
            <Route path="/einstellungen" element={parent(<Settings />)} />
            <Route path="/einstellungen/zugriff" element={parent(<AccessPage />)} />
            <Route path="/einstellungen/anfragen" element={parent(<RequestsPage />)} />
            <Route path="/einstellungen/protokoll" element={parent(<HistoryPage mode="access" />)} />
            <Route path="/einstellungen/konten" element={parent(<AccountsPage />)} />
            <Route path="/liste/:id/verlauf" element={parent(<HistoryPage mode="list" />)} />
            <Route path="/teilen" element={parent(<SharePage />)} />
            <Route path="/statistik" element={parent(<StatsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </main>
      </AuthProvider>
    </HashRouter>
  );
}
