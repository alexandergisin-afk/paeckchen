import { useRef, useState } from "react";
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
  | { kind: "error"; message: string; showShops: boolean };

/** Produktsuche direkt in Päckli. Ein Tipp auf ein Ergebnis übernimmt Name, Bild, Preis und Link. */
export function ProductSearch({ onPick }: { onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async () => {
    const query = q.trim();
    if (query.length < 2) return inputRef.current?.focus();
    inputRef.current?.blur(); // Tastatur schließen, damit die Ergebnisse sichtbar sind
    setPicked(null);
    setState({ kind: "loading" });
    try {
      const { data, error } = await db().functions.invoke("produkt-suche", { body: { q: query, limit: 12 } });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        return setState({
          kind: "error",
          showShops: true,
          message: status === 404 ? "Die Produktsuche ist noch nicht eingerichtet (Code 404)." : `Die Suche ist gerade nicht erreichbar${status ? ` (Code ${status})` : ""}.`,
        });
      }
      if (data?.error) {
        const msg: Record<string, string> = {
          not_configured: "Die Produktsuche ist noch nicht eingerichtet: Die eBay-Zugangsdaten fehlen in Supabase.",
          ebay_auth: `eBay hat die Zugangsdaten abgelehnt${data.status ? ` (Code ${data.status})` : ""}.`,
          ebay_search: `eBay hat die Suche abgelehnt${data.status ? ` (Code ${data.status})` : ""}.`,
        };
        return setState({ kind: "error", showShops: true, message: msg[data.error] ?? "Die Suche hat gerade nicht geklappt." });
      }
      setState({ kind: "results", items: (data?.results ?? []) as SearchResult[] });
    } catch {
      setState({ kind: "error", showShops: true, message: "Keine Verbindung. Prüf bitte dein Internet." });
    }
  };

  const pick = (r: SearchResult) => {
    setPicked(r);
    onPick(r);
  };

  const enc = encodeURIComponent(q.trim());

  return (
    <div className="psearch">
      <label className="field" style={{ marginBottom: 10 }}>
        <span>Produkt suchen</span>
        <div className="row">
          <input
            ref={inputRef} type="search" enterKeyHint="search" autoComplete="off" autoFocus value={q}
            placeholder="z. B. Lego Baumhaus" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          />
          <button type="button" className="btn" onClick={search} aria-label="Suchen"><IconSearch /></button>
        </div>
      </label>

      {state.kind === "loading" && <p className="hint detect busy">Suche läuft …</p>}

      {picked && (
        <div className="picked">
          {picked.image && <img src={picked.image} alt="" referrerPolicy="no-referrer" />}
          <div><b>Übernommen</b><span className="hint">Prüf unten kurz die Angaben und wähle, wie wichtig der Wunsch ist.</span></div>
          <button type="button" className="btn quiet" onClick={() => setPicked(null)}>Andere Auswahl</button>
        </div>
      )}

      {state.kind === "results" && !picked && (
        state.items.length === 0 ? (
          <p className="hint">Nichts gefunden. Versuch es mit anderen oder weniger Wörtern.</p>
        ) : (
          <ul className="results" aria-label="Suchergebnisse">
            {state.items.map((r) => (
              <li key={r.url}>
                <button type="button" className="result" onClick={() => pick(r)}>
                  <span className="rimg">{r.image ? <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🎁</span>}</span>
                  <span className="rtext">
                    <span className="rtitle">{r.title}</span>
                    <span className="rmeta">{r.price_cents != null && <b>{r.currency && r.currency !== "EUR" ? `${(r.price_cents / 100).toFixed(2)} ${r.currency}` : formatPrice(r.price_cents)}</b>} bei {r.shop}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {state.kind === "error" && <p className="notice error" role="alert">{state.message}</p>}

      {(state.kind === "results" || (state.kind === "error" && state.showShops)) && !picked && q.trim() && (
        <details className="qs">
          <summary><IconSearch /> In einem bestimmten Shop suchen</summary>
          <div className="chips" style={{ marginTop: 6 }}>
            {SEARCH_SHOPS.map((s) => (
              <a key={s.name} className="fchip" href={s.url(enc)} target="_blank" rel="noopener noreferrer">{s.name}</a>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 0 4px" }}>Öffnet sich in einem neuen Tab. Link kopieren, zurückkommen und unten einfügen.</p>
        </details>
      )}
    </div>
  );
}
