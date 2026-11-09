import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Fehlen die Zugangsdaten, zeigt die App eine Einrichtungsseite statt abzustürzen. */
export const isConfigured = Boolean(url && key);

/**
 * Wiederholt reine Leseanfragen bei kurzen Netzaussetzern (bis zu 2 Mal).
 * Schreibende Anfragen (z. B. Reservieren) werden bewusst NICHT wiederholt,
 * damit nichts doppelt passiert, falls die erste Anfrage doch angekommen ist.
 */
const SAFE_RPC = /\/rpc\/(guest_list|my_reservations)$/;
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const retryable = method === "GET" || method === "HEAD" || SAFE_RPC.test(href.split("?")[0]);
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (!retryable || attempt >= 2 || (e as Error).name === "AbortError") throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, key!, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchWithRetry },
    })
  : null;

/** Für Seiten, die nur bei fertiger Konfiguration gerendert werden. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  return supabase;
}

/** Adresse, zu der der Anmeldelink zurückführt (funktioniert auf github.io und eigener Domain). */
export const appUrl = () => window.location.origin + window.location.pathname;

/** Link für Schenkende. Funktioniert ohne Anmeldung. */
export const guestLink = (token: string) => `${appUrl()}#/w/${token}`;

/** Einladung zur Mitbearbeitung. Funktioniert nur einmal und 7 Tage lang. */
export const inviteLink = (token: string) => `${appUrl()}#/einladung/${token}`;
