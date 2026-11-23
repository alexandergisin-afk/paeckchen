/**
 * Gerätespeicher (localStorage) an einer Stelle.
 *
 * Alles, was Päckli auf einem Gerät ablegt, steht hier in KEYS. Zugriffe schlagen nie fehl:
 * Im privaten Modus oder bei vollem Speicher merkt sich das Gerät eben nichts.
 * Die Schlüsselnamen dürfen sich nicht ändern, sonst wären gespeicherte Werte nach einem Update weg.
 */
export const KEYS = {
  // Gäste
  codes: "paeckchen-codes",                       // Reservierungscodes (Schlüssel zum Aufheben)
  name: "paeckchen-name",                         // zuletzt verwendeter Name beim Reservieren
  size: "paeckchen-size",                         // frühere Schriftgröße (nicht mehr genutzt)
  guestLists: "paeckli-gast-listen",              // auf diesem Gerät geöffnete Wunschlisten
  guestView: "paeckli-guest-view",                // Ansicht Kacheln/Liste in der Gästeansicht
  guestAppHint: "paeckli-gast-app-hinweis",       // Hinweis „Als App speichern“ ausgeblendet
  howto: (token: string) => `paeckli-howto-${token}`, // Erklärkasten schon gesehen
  // Eltern
  wishView: "paeckli-wish-view",                  // Ansicht Liste/Kacheln auf der Listenseite
  dragTip: "paeckli-drag-tipp",                   // Tipp „gedrückt halten und ziehen“ gesehen
  allReserved: (listId: string) => `paeckli-alles-vergeben-${listId}`, // Freudenmoment schon gezeigt
  oldRecentSearches: "paeckli-recent-searches",   // früher: letzte Suchen pro Gerät (wird aufgeräumt)
  // Anmeldung und Abläufe
  pendingInvite: "paeckchen-pending-invite",      // Einladung, die nach der Anmeldung angenommen wird
  returnAfterLogin: "paeckli-nach-anmeldung",     // Rücksprung nach der Anmeldung
  pendingShare: "paeckli-pending-share",          // aus einer anderen App geteilter Link
  deviceSynced: (userId: string) => `paeckli-geraet-uebernommen-${userId}`, // Gerät ins Konto übernommen
  // Offline-Modus
  offline: "paeckli-offline",                     // zuletzt geladene Daten (beim Abmelden gelöscht)
} as const;

export function getItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* privater Modus o. Ä. */ }
}

export function removeItem(key: string): void {
  try { localStorage.removeItem(key); } catch { /* egal */ }
}

export function getJSON<T>(key: string, fallback: T): T {
  const v = getItem(key);
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

export function setJSON(key: string, value: unknown): void {
  setItem(key, JSON.stringify(value));
}

/** Merker „schon gesehen/erledigt“ */
export const hasFlag = (key: string) => !!getItem(key);
export const setFlag = (key: string) => setItem(key, "1");
