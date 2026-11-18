/**
 * Wunschlisten, die auf diesem Gerät als Gast geöffnet wurden. Damit Schenkende Päckli wie eine App
 * nutzen können: Startseite „Deine Wunschlisten“ statt jedes Mal den Link zu suchen.
 * Gespeichert wird nur auf dem Gerät (Link-Schlüssel, Titel, Datum), nichts auf dem Server.
 */
export interface VisitedList {
  token: string;
  title: string;
  recipient_name: string | null;
  event_date: string | null;
  cover: number;
  seenAt: number;
}

const KEY = "paeckli-gast-listen";
const MAX = 30;

export function getGuestLists(): VisitedList[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as VisitedList[];
    const today = new Date().toISOString().slice(0, 10);
    // Bevorstehende Anlässe zuerst (der nächste oben), dann der Rest nach letztem Besuch
    return all.sort((a, b) => {
      const ua = a.event_date && a.event_date >= today ? 0 : 1, ub = b.event_date && b.event_date >= today ? 0 : 1;
      if (ua !== ub) return ua - ub;
      if (ua === 0) return a.event_date!.localeCompare(b.event_date!);
      return b.seenAt - a.seenAt;
    });
  } catch {
    return [];
  }
}

export function rememberGuestList(l: Omit<VisitedList, "seenAt">) {
  try {
    const rest = getGuestLists().filter((x) => x.token !== l.token);
    const next = [{ ...l, seenAt: Date.now() }, ...rest].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* Speicher voll oder gesperrt: dann eben nicht */ }
}

export function forgetGuestList(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify(getGuestLists().filter((x) => x.token !== token))); } catch { /* egal */ }
}
