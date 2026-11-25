import { useEffect, useState } from "react";
import { NEW_VERSION_EVENT } from "../lib/versionCheck";

/** Leiste oben, wenn eine neue Version von Päckli bereitsteht. */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener(NEW_VERSION_EVENT, on);
    return () => window.removeEventListener(NEW_VERSION_EVENT, on);
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>Neue Version von Päckli verfügbar.</span>
      <button type="button" className="btn small" onClick={() => window.location.reload()}>Aktualisieren</button>
    </div>
  );
}
