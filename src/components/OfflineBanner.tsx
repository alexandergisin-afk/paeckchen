import { useEffect, useState } from "react";

/** Zeigt einen Hinweis, solange keine Internetverbindung besteht. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      Keine Internetverbindung. Änderungen sind erst wieder möglich, wenn du online bist.
    </div>
  );
}
