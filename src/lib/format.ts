export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 864e5);
}

export function dateLabel(date: string | null): string {
  if (!date) return "";
  const d = new Date(date + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("de-DE", opts);
}

export function countdownLabel(date: string | null): string | null {
  const n = daysUntil(date);
  if (n == null || n < 0) return null;
  return n === 0 ? "Heute" : n === 1 ? "Morgen" : `noch ${n} Tage`;
}

/** Verständliche Meldungen statt technischer Fehlertexte. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
       if (/database error saving new user|signups? not allowed|signup_not_allowed/i.test(msg))
       return "Päckchen ist gerade nur für eingeladene Familien. Bitte frag die Person, die dich eingeladen hat, ob deine E-Mail-Adresse freigeschaltet ist.";
  if (/row-level security|permission|42501|forbidden/i.test(msg)) return "Dafür fehlt dir die Berechtigung.";
  if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte warte ein paar Minuten.";
  if (/failed to fetch|network/i.test(msg)) return "Keine Verbindung. Prüf bitte dein Internet.";
  return "Das hat nicht geklappt. Bitte versuch es noch einmal.";
}

let toastTimer: number | undefined;
export function toast(text: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 3200);
}
