import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { cached, load as loadCached, remember } from "../lib/cache";
import { db } from "../lib/supabase";
import { SEARCH_SHOPS, formatPrice } from "../lib/wishes";
import { IconSearch } from "./Icons";

export interface SearchResult {
  title: string;
  image: string | null;
  price_cents: number | null;
  currency: string | null;
  url: string;
  shop: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; items: SearchResult[] }
  | { kind: "error"; message: string };

/** „Zuletzt gesucht“ gehört der angemeldeten Person (gilt auf allen Geräten), höchstens 3 Begriffe. */
const MAX_RECENT = 3;
const OLD_DEVICE_KEY = "paeckli-recent-searches"; // früher pro Gerät gespeichert

async function fetchRecent(uid: string): Promise<string[]> {
  const { data } = await db().from("recent_searches").select("terms").eq("user_id", uid).maybeSingle();
  return ((data?.terms as string[] | undefined) ?? []).slice(0, MAX_RECENT);
}

async function storeRecent(uid: string, terms: string[]) {
  remember(`recent:${uid}`, terms);
  await db().from("recent_searches").upsert({ user_id: uid, terms, updated_at: new Date().toISOString() });
}

/** Produktsuche direkt in Päckli. Ein Tipp auf ein Ergebnis übernimmt Name, Bild, Preis und Link. */
export function ProductSearch({ onPick, compact = false }: { onPick: (r: SearchResult) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const [recent, setRecent] = useState<string[]>(() => (uid ? cached<string[]>(`recent:${uid}`) ?? [] : []));

  useEffect(() => {
    try { localStorage.removeItem(OLD_DEVICE_KEY); } catch { /* egal */ }
    if (!uid) return;
    loadCached(`recent:${uid}`, () => fetchRecent(uid)).then(setRecent, () => undefined);
  }, [uid]);

  const saveRecent = (next: string[]) => {
    setRecent(next);
    if (uid) storeRecent(uid, next).catch(() => undefined);
  };
  const removeRecent = (term: string) => saveRecent(recent.filter((x) => x !== term));
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (term = q) => {
    const query = term.trim();
    if (query.length < 2) return inputRef.current?.focus();
    inputRef.current?.blur(); // Tastatur schließen, damit die Ergebnisse sichtbar sind
    setQ(query);
    saveRecent([query, ...recent.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, MAX_RECENT));
    setState({ kind: "loading" });
    try {
      const { data, error } = await db().functions.invoke("produkt-suche", { body: { q: query, limit: 25 } });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        return setState({ kind: "error", message: status === 404 ? "Die Produktsuche ist noch nicht eingerichtet (Code 404)." : `Die Suche ist gerade nicht erreichbar${status ? ` (Code ${status})` : ""}.` });
      }
      if (data?.error) {
        const msg: Record<string, string> = {
          not_configured: "Die Produktsuche ist noch nicht eingerichtet: Die eBay-Zugangsdaten fehlen in Supabase.",
          ebay_auth: `eBay hat die Zugangsdaten abgelehnt${data.status ? ` (Code ${data.status})` : ""}.`,
          ebay_search: `eBay hat die Suche abgelehnt${data.status ? ` (Code ${data.status})` : ""}.`,
        };
        return setState({ kind: "error", message: msg[data.error] ?? "Die Suche hat gerade nicht geklappt." });
      }
      setState({ kind: "results", items: (data?.results ?? []) as SearchResult[] });
    } catch {
      setState({ kind: "error", message: "Keine Verbindung. Prüf bitte dein Internet." });
    }
  };

  const enc = encodeURIComponent(q.trim());

  return (
    <div className="psearch">
      <label htmlFor="produkt-suche" className="sr">Produkt suchen</label>
      <div className={`search-big ${compact ? "compact" : ""}`}>
        <IconSearch />
        <input
          id="produkt-suche" ref={inputRef} type="search" enterKeyHint="search" autoComplete="off" autoFocus={!compact} value={q}
          placeholder="Produkt suchen, z. B. Lego Baumhaus" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
        />
        {q.trim().length >= 2 && <button type="button" className="btn small" onClick={() => search()}>Suchen</button>}
      </div>

      {state.kind === "idle" && recent.length > 0 && (
        <div className="recent">
          <span className="hint">Zuletzt gesucht:</span>
          {recent.slice(0, MAX_RECENT).map((r) => (
            <span key={r} className="recent-chip">
              <button type="button" className="recent-term" onClick={() => search(r)}>{r}</button>
              <button type="button" className="recent-x" aria-label={`„${r}“ aus den letzten Suchen entfernen`} onClick={() => removeRecent(r)}>×</button>
            </span>
          ))}
        </div>
      )}

      {state.kind === "loading" && <p className="hint detect busy">Suche läuft …</p>}

      {state.kind === "results" && (
        state.items.length === 0 ? (
          <p className="hint">Nichts gefunden. Versuch es mit anderen oder weniger Wörtern.</p>
        ) : (
          <>
            <p className="hint result-count">{state.items.length} Treffer bei eBay, Neuware</p>
            <ul className="results" aria-label="Suchergebnisse">
              {state.items.map((r) => (
                <li key={r.url}>
                  <button type="button" className="result" onClick={() => onPick(r)}>
                    <span className="rimg">{r.image ? <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🎁</span>}</span>
                    <span className="rtext">
                      <span className="rtitle">{r.title}</span>
                      <span className="rmeta">{r.price_cents != null && <b>{r.currency && r.currency !== "EUR" ? `${(r.price_cents / 100).toFixed(2)} ${r.currency}` : formatPrice(r.price_cents)}</b>}</span>
                    </span>
                    <span className="rpick">Wählen</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      {state.kind === "error" && <p className="notice error" role="alert">{state.message}</p>}

      {(state.kind === "results" || state.kind === "error") && q.trim() && (
        <details className="qs">
          <summary><IconSearch /> In einem bestimmten Shop suchen</summary>
          <div className="chips" style={{ marginTop: 6 }}>
            {SEARCH_SHOPS.map((s) => (
              <a key={s.name} className="fchip" href={s.url(enc)} target="_blank" rel="noopener noreferrer">{s.name}</a>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 0 4px" }}>Öffnet sich in einem neuen Tab. Link kopieren, zurückkommen und „Link einfügen“ wählen.</p>
        </details>
      )}
    </div>
  );
}
