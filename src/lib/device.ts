/**
 * Was sich das Gerät eines Gastes merkt – nur lokal im Browser, nie auf dem Server:
 * die Reservierungscodes (Schlüssel zum Aufheben), und den zuletzt verwendeten Namen.
 */
import { getJSON, KEYS, removeItem, setJSON } from "./storage";
const CODES = KEYS.codes;
const NAME = KEYS.name;
const SIZE = KEYS.size;

const read = getJSON;
const write = setJSON;

export const getCodes = () => read<string[]>(CODES, []);
export const addCode = (code: string) => write(CODES, [...new Set([...getCodes(), code])].slice(-50));
export const removeCode = (code: string) => write(CODES, getCodes().filter((c) => c !== code));
/** Entfernt Codes, deren Reservierung nicht mehr existiert (z. B. von den Eltern freigegeben). */
export const keepCodes = (valid: Set<string>) => write(CODES, getCodes().filter((c) => valid.has(c)));

export const getName = () => read<string>(NAME, "");
export const setName = (name: string) => write(NAME, name);

/** Die frühere Einstellung „Große Schrift“ gibt es nicht mehr: einmalig aufräumen. */
export function forgetTextSize() {
  removeItem(SIZE);
}
