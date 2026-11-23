import { useEffect } from "react";
import { isIOS } from "./install";

/**
 * „Als App speichern“: Auf dem iPhone übernimmt der Startbildschirm die aktuelle Adresse, wenn kein
 * Manifest da ist. Darum hier die Liste in die Adresse schreiben und das Manifest kurz entfernen.
 * (Android nutzt das Manifest und teilt den Speicher mit dem Browser, dort klappt „Deine Wunschlisten“ direkt.)
 */
export function useAppStartUrl(token: string) {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("liste") !== token) {
        url.searchParams.set("liste", token);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch { /* egal */ }
    // Beim Verlassen der Gästeansicht die Merkhilfe wieder aus der Adresse nehmen
    const cleanUrl = () => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("liste")) { url.searchParams.delete("liste"); window.history.replaceState(window.history.state, "", url.toString()); }
      } catch { /* egal */ }
    };
    if (!isIOS()) return cleanUrl;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const parent = link?.parentNode;
    link?.remove();
    return () => { if (link && parent) parent.appendChild(link); cleanUrl(); };
  }, [token]);
}
