/**
 * Neue Version von Päckli erkennen und reagieren.
 *
 * 1. Fehlt beim Nachladen ein Programmteil (weil inzwischen eine neue Version veröffentlicht wurde und
 *    die alten Dateien weg sind), lädt die App einmal neu. Eine Sperre von einer Minute verhindert Endlosschleifen.
 * 2. Der Service Worker sucht beim Zurückkehren in die App und alle 30 Minuten nach einer neuen Version.
 *    Übernimmt eine neue Version, meldet das ein Ereignis; die Leiste „Neue Version verfügbar“ zeigt es an.
 */
export const NEW_VERSION_EVENT = "paeckli:neue-version";
const RELOAD_KEY = "paeckli-neu-geladen";

const isChunkError = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
    .test(String((e as Error)?.message ?? e));

/** Einmal neu laden (nicht öfter als einmal pro Minute). Gibt false zurück, wenn gerade erst neu geladen wurde. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* ohne Sitzungsspeicher trotzdem einmal versuchen */ }
  window.location.reload();
  return true;
}

/** Für lazy(): fehlt ein Programmteil, einmal neu laden statt Fehlermeldung. */
export function importWithReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().catch((e) => {
    if (isChunkError(e) && reloadOnce()) return new Promise<T>(() => {}); // Seite lädt gleich neu
    throw e;
  });
}

/** Einmal beim Start aufrufen. */
export function setupVersionCheck() {
  // Vite meldet fehlgeschlagenes Vorladen von Programmteilen über dieses Ereignis
  window.addEventListener("vite:preloadError", (ev) => { if (reloadOnce()) ev.preventDefault(); });

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller; // beim allerersten Besuch keine „neue Version“
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.dispatchEvent(new Event(NEW_VERSION_EVENT));
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      const check = () => { reg.update().catch(() => undefined); };
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      window.setInterval(check, 30 * 60_000);
    }).catch(() => undefined);
  });
}
