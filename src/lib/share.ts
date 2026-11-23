/**
 * Geteilte Links aus anderen Apps.
 * Android: Päckli erscheint (als installierte App) im Teilen-Menü und wird mit ?share_url=… geöffnet.
 * iPhone: Ein Kurzbefehl öffnet #/teilen?url=… .
 * Der Link wird gemerkt, bis er einer Liste zugeordnet ist (auch über eine Anmeldung hinweg).
 */
import { getItem, KEYS, removeItem, setItem } from "./storage";
const KEY = KEYS.pendingShare;

/** Findet den ersten Link in einem Text („Schau mal: https://…“). */
export function firstUrl(...parts: (string | null | undefined)[]): string | null {
  for (const p of parts) {
    const m = p?.match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[),.;!?]+$/, "");
  }
  return null;
}

export function rememberShare(url: string) {
  setItem(KEY, url);
}
export function pendingShare(): string | null {
  return getItem(KEY);
}
export function clearShare() {
  removeItem(KEY);
}

/** Beim Start: geteilten Link aus der Adresse übernehmen und die Adresse aufräumen. */
export function captureShareFromLaunch(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("share_url") && !q.has("share_text")) return false;
  const url = firstUrl(q.get("share_url"), q.get("share_text"), q.get("share_title"));
  if (url) rememberShare(url);
  window.history.replaceState(null, "", window.location.pathname + "#/teilen");
  return true;
}
