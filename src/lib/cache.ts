/**
 * Zwischenspeicher für geladene Daten. Seiten zeigen Gespeichertes sofort an und laden im Hintergrund frisch.
 * Übersicht, Listen und Gästeansichten werden zusätzlich auf dem Gerät gespeichert, damit sie auch ohne
 * Internet angezeigt werden können (Offline-Modus). Beim Abmelden wird alles gelöscht.
 */
const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

const OFFLINE_KEY = "paeckli-offline";
const PERSIST = /^(dashboard|list:|guest:)/;
const MAX_BYTES = 1_500_000;

// Beim Start: auf dem Gerät Gespeichertes übernehmen
try {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(OFFLINE_KEY) : null;
  if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { at: number; value: unknown }>)) store.set(k, v);
} catch { /* beschädigt oder nicht verfügbar: ignorieren */ }

let saveTimer = 0;
function persistSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const out: Record<string, { at: number; value: unknown }> = {};
      // die neuesten zuerst, damit bei Platzmangel die ältesten wegfallen
      const entries = [...store.entries()].filter(([k]) => PERSIST.test(k)).sort((a, b) => b[1].at - a[1].at);
      let size = 0;
      for (const [k, v] of entries) {
        const len = JSON.stringify(v).length;
        if (size + len > MAX_BYTES) break;
        out[k] = v;
        size += len;
      }
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(out));
    } catch { /* Speicher voll oder gesperrt: dann eben nur im Arbeitsspeicher */ }
  }, 300);
}

export function cached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

/** Wann ein Eintrag zuletzt frisch geladen wurde (für „Stand von …“). */
export function cachedAt(key: string): number | undefined {
  return store.get(key)?.at;
}

export function remember<T>(key: string, value: T) {
  store.set(key, { at: Date.now(), value });
  if (PERSIST.test(key)) persistSoon();
}

export function forget(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  persistSoon();
}

/** Lädt einmalig (gleichzeitige Aufrufe teilen sich die Anfrage) und merkt sich das Ergebnis. */
export function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = fetcher().then((v) => { remember(key, v); return v; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Wie lange ein Eintrag als frisch gilt (für Vorladen im Leerlauf). */
export function isFresh(key: string, ms = 60_000) {
  const e = store.get(key);
  return !!e && Date.now() - e.at < ms;
}

/** Nach dem Abmelden alles vergessen, auch auf dem Gerät. */
export function clearCache() {
  store.clear();
  try { localStorage.removeItem(OFFLINE_KEY); } catch { /* egal */ }
}
