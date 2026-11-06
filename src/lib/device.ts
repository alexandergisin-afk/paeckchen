/**
 * Was sich das Gerät eines Gastes merkt – nur lokal im Browser, nie auf dem Server:
 * die Reservierungscodes (Schlüssel zum Aufheben), den zuletzt verwendeten Namen und die Schriftgröße.
 */
const CODES = "paeckchen-codes";
const NAME = "paeckchen-name";
const SIZE = "paeckchen-size";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privater Modus o. Ä.: dann merkt sich das Gerät eben nichts */
  }
}

export const getCodes = () => read<string[]>(CODES, []);
export const addCode = (code: string) => write(CODES, [...new Set([...getCodes(), code])].slice(-50));
export const removeCode = (code: string) => write(CODES, getCodes().filter((c) => c !== code));
/** Entfernt Codes, deren Reservierung nicht mehr existiert (z. B. von den Eltern freigegeben). */
export const keepCodes = (valid: Set<string>) => write(CODES, getCodes().filter((c) => valid.has(c)));

export const getName = () => read<string>(NAME, "");
export const setName = (name: string) => write(NAME, name);

export const getLargeText = () => read<boolean>(SIZE, false);
export function setLargeText(on: boolean) {
  write(SIZE, on);
  applyTextSize();
}
export function applyTextSize() {
  document.documentElement.dataset.size = getLargeText() ? "large" : "normal";
}
