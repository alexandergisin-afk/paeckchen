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

/** Kurzform für die Übersicht: „heute“, „morgen“, „in 31 Tagen“. Vorbei: null. */
export function daysChip(date: string | null): { text: string; soon: boolean } | null {
  const n = daysUntil(date);
  if (n == null || n < 0) return null;
  return { text: n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`, soon: n <= 7 };
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
    return "Päckli ist gerade nur für eingeladene Familien. Frag die Person, die dich eingeladen hat, ob deine E-Mail-Adresse freigeschaltet ist.";
  if (/family_only/i.test(msg)) return "Mit einem Konto zum Schenken kannst du keine eigenen Listen anlegen.";
  if (/row-level security|permission|42501|forbidden/i.test(msg)) return "Dafür fehlt dir die Berechtigung.";
  if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Warte ein paar Minuten.";
  if (/failed to fetch|network|load failed/i.test(msg)) return "Keine Verbindung. Prüf dein Internet und versuch es noch einmal.";
  return "Das hat nicht geklappt. Versuch es noch einmal.";
}

let toastTimer: number | undefined;
export type ToastKind = "success" | "info" | "error";

const ICONS: Record<ToastKind | "undo", string> = {
  success: '<path d="M5 12l5 5L20 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
};

/** Lange Namen in Meldungen kürzen („Hörspielfiguren für die Toniebox, Wissens…“). */
export const short = (text: string, max = 40) => (text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text);

/** Kurze Bestätigungen ohne Satzpunkt („Name gespeichert“); mehrere Sätze behalten ihre Punkte. */
const tidy = (text: string) => (/^[^.!?]+\.$/.test(text) ? text.slice(0, -1) : text);

/** Anzeigedauer nach Textlänge: mindestens 3 s (Fehler 5 s), höchstens 10 s. */
const durationFor = (text: string, kind: ToastKind) => Math.min(10_000, Math.max(kind === "error" ? 5000 : 3000, 2000 + text.length * 45));

let hideAt = 0, remaining = 0, paused = false;

function render(opts: { text: string; kind: ToastKind; ms: number; action?: { label: string; onClick: () => void } }) {
  const el = document.getElementById("toast");
  if (!el) return;
  window.clearTimeout(toastTimer);
  const text = tidy(opts.text);
  el.className = `toast toast-${opts.kind}`;
  el.setAttribute("role", opts.kind === "error" ? "alert" : "status");
  el.setAttribute("aria-live", opts.kind === "error" ? "assertive" : "polite");
  el.textContent = "";
  const body = document.createElement("div"); body.className = "toast-body";
  if (opts.action && text.length > 34) body.classList.add("stack"); // langer Text: Knopf darunter
  const icon = document.createElement("span"); icon.className = "toast-icon"; icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[opts.action ? "undo" : opts.kind]}</svg>`;
  const span = document.createElement("span"); span.className = "toast-text"; span.textContent = text;
  body.append(icon, span);
  if (opts.action) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "toast-action"; btn.textContent = opts.action.label;
    const onClick = opts.action.onClick;
    btn.onclick = (e) => { e.stopPropagation(); hide(); onClick(); };
    body.append(btn);
  }
  el.append(body);
  if (opts.action) {
    // Zeitbalken: so lange lässt sich noch rückgängig machen
    const bar = document.createElement("span"); bar.className = "toast-timer";
    const fill = document.createElement("span"); fill.style.animationDuration = `${opts.ms}ms`;
    bar.append(fill); el.append(bar);
  }
  void el.offsetWidth; // Einblenden neu starten
  el.classList.add("show");
  paused = false; remaining = opts.ms; hideAt = Date.now() + opts.ms;
  el.dataset.pausable = opts.action ? "0" : "1";
  toastTimer = window.setTimeout(hide, opts.ms);
}

function hide() {
  window.clearTimeout(toastTimer);
  document.getElementById("toast")?.classList.remove("show");
}

/** Einmalig: Meldung antippen schließt sie, wegwischen nach unten auch; Finger oder Maus darauf hält sie an. */
function wire() {
  const el = document.getElementById("toast");
  if (!el || el.dataset.wired) return;
  el.dataset.wired = "1";
  let startY = 0;
  const pause = () => { if (el.dataset.pausable !== "1" || paused) return; paused = true; remaining = Math.max(0, hideAt - Date.now()); window.clearTimeout(toastTimer); };
  const resume = () => { if (!paused) return; paused = false; hideAt = Date.now() + Math.max(remaining, 1500); toastTimer = window.setTimeout(hide, Math.max(remaining, 1500)); };
  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("pointerdown", (e) => { startY = e.clientY; pause(); });
  el.addEventListener("pointerup", (e) => {
    if ((e.target as HTMLElement).closest(".toast-action")) return;
    if (e.clientY - startY > 30 || Math.abs(e.clientY - startY) < 8) hide(); // wegwischen oder antippen
    else resume();
  });
}

/** Meldung unten: Bestätigung (Standard), Hinweis oder Fehler. */
export function toast(text: string, kind: ToastKind = "success") {
  wire();
  render({ text, kind, ms: durationFor(text, kind) });
}

/** Fehlermeldung (rot, länger sichtbar, wird sofort vorgelesen). */
export const toastError = (text: string) => toast(text, "error");

/** Meldung mit Knopf, z. B. „Wunsch gelöscht – Rückgängig“; läuft fest nach ms ab (nicht anhaltbar). */
export function toastAction(text: string, label: string, onAction: () => void, ms = 6000) {
  wire();
  render({ text, kind: "info", ms, action: { label, onClick: onAction } });
}

/** Vorname aus einem Anzeigenamen oder einer E-Mail-Adresse, z. B. „julia.weber“ → „Julia“. */
export const firstNameOf = (n: string) => {
  const f = n.trim().split(/[\s._+-]+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
};
