import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./lib/auth";
import { TopBar } from "./components/TopBar";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ListPage } from "./pages/ListPage";

function Routed({ linkError }: { linkError: string | null }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="loading">Einen Moment …</p>;
  if (!session) return <Login linkError={linkError} />;
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/liste/:id" element={<ListPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ linkError }: { linkError: string | null }) {
  if (!isConfigured) return <Setup />;
  return (
    <HashRouter>
      <AuthProvider>
        <TopBar />
        <main id="app">
          <Routed linkError={linkError} />
        </main>
      </AuthProvider>
    </HashRouter>
  );
}
