import { supabase } from "./supabase";

/**
 * Meldet unerwartete Fehler anonym an Supabase (Tabelle client_errors), damit Probleme auffallen,
 * bevor sich jemand beschwert. Keine Namen, keine E-Mails. Links zu Listen und Einladungen werden
 * unkenntlich gemacht, weil sie als Schlüssel funktionieren.
 */
const seen = new Set<string>();
let sent = 0;

export function scrub(text: string): string {
  return text
    .replace(/(#\/w\/)[^\s/?#]+/g, "$1…")
    .replace(/(#\/einladung\/)[^\s/?#]+/g, "$1…")
    .replace(/([?&](url|share_url|share_text|code|token)=)[^&\s]+/gi, "$1…")
    .replace(/[A-Z2-9]{4}-[A-Z2-9]{4}/g, "XXXX-XXXX")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "…@…");
}

export function reportError(message: string, stack?: string) {
  if (!supabase || sent >= 10) return; // höchstens 10 Meldungen pro Sitzung
  const key = message.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  supabase
    .rpc("log_client_error", {
      p_message: scrub(message).slice(0, 500),
      p_stack: stack ? scrub(stack).slice(0, 2000) : null,
      p_page: scrub(window.location.hash || "#/").slice(0, 200),
      p_agent: navigator.userAgent.slice(0, 200),
    })
    .then(() => undefined, () => undefined);
}

export function installErrorReporting() {
  window.addEventListener("error", (e) => {
    // Fehler beim Laden fremder Bilder o. Ä. sind keine App-Fehler
    if (!(e.error instanceof Error)) return;
    reportError(e.message, e.error.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    const msg = r?.message ?? String(e.reason);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return; // Netzaussetzer zeigt der Offline-Hinweis
    reportError(msg, r?.stack);
  });
}
