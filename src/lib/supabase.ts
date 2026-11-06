import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Fehlen die Zugangsdaten, zeigt die App eine Einrichtungsseite statt abzustürzen. */
export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, key!, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
