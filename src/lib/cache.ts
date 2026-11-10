/**
 * Kleiner Zwischenspeicher für bereits geladene Daten (nur im Arbeitsspeicher, pro Sitzung).
 * Seiten zeigen Gespeichertes sofort an und laden im Hintergrund frisch nach.
 */
const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function cached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function remember<T>(key: string, value: T) {
  store.set(key, { at: Date.now(), value });
}

export function forget(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
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

/** Nach dem Abmelden alles vergessen. */
export function clearCache() {
  store.clear();
}
