import { useEffect, useRef, useState } from "react";
import { readLink, type Draft } from "../lib/linkPreview";
import { IconBack, IconEdit } from "./Icons";
import { ProductSearch, type SearchResult } from "./ProductSearch";
import { WishForm } from "./WishForm";

type Step = "source" | "link" | "details";

/**
 * Wunsch hinzufügen in zwei Schritten (Entwurf „Variante A“):
 * 1. Woher kommt der Wunsch? Suchen, Link einfügen oder selbst eintragen.
 * 2. Nur noch die Details: wie wichtig, wie viele, Hinweis.
 * Ein aus einer anderen App geteilter Link springt direkt zur Link-Auswertung.
 */
export function AddWishFlow({ open, onClose, listId, recipient, initialUrl, onSaved }: {
  open: boolean;
  onClose: () => void;
  listId: string;
  recipient: string | null;
  initialUrl?: string;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closingByApp = useRef(false);
  const [step, setStep] = useState<Step>("source");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cameFromSource, setCameFromSource] = useState(true);
  const [busy, setBusy] = useState(false);

  // Dialog öffnen/schließen (wie FormSheet)
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) { closingByApp.current = true; d.close(); }
  }, [open]);

  // Beim Öffnen zurücksetzen; geteilter Link → direkt zur Auswertung
  useEffect(() => {
    if (!open) return;
    setDraft(null);
    if (initialUrl) { setStep("link"); setCameFromSource(false); } else { setStep("source"); setCameFromSource(true); }
  }, [open, initialUrl]);

  const toDetails = (d: Draft) => { setDraft(d); setStep("details"); };
  const pick = (r: SearchResult) => toDetails({ title: r.title, url: r.url, shop: r.shop, price_cents: r.price_cents, image: r.image, source: "search" });
  const back = () => { if (step === "details" && draft?.source === "link") setStep("link"); else setStep("source"); };
  const name = recipient?.trim();

  return (
    <dialog className="fsheet add-flow" ref={ref} aria-label="Neuer Wunsch"
      onClose={() => { if (closingByApp.current) { closingByApp.current = false; return; } onClose(); }}>
      {open && (
        <>
          <header className="fs-bar step-bar">
            {step === "source" || !cameFromSource && step === "link" ? (
              <button type="button" className="fs-cancel" onClick={onClose}>Abbrechen</button>
            ) : (
              <button type="button" className="fs-cancel back" onClick={back}><IconBack /> Zurück</button>
            )}
            <span className="step-info">{step === "details" ? "Schritt 2 von 2" : "Schritt 1 von 2"}</span>
          </header>

          <div className="fs-body">
            {step === "source" && (
              <div className="flow-step">
                <h2 className="flow-title">{name ? `Was wünscht sich ${name}?` : "Was steht auf dem Wunschzettel?"}</h2>
                <ProductSearch onPick={pick} />
                <p className="or-sep"><span>oder</span></p>
                <div className="source-tiles">
                  <button type="button" className="source-tile" onClick={() => setStep("link")}>
                    <span className="source-icon" aria-hidden="true">🔗</span>
                    <b>Link einfügen</b>
                    <small>aus der Zwischenablage, z. B. von Thalia</small>
                  </button>
                  <button type="button" className="source-tile" onClick={() => toDetails({ title: "", url: null, shop: null, price_cents: null, image: null, source: "manual" })}>
                    <span className="source-icon" aria-hidden="true"><IconEdit /></span>
                    <b>Selbst eintragen</b>
                    <small>ohne Link, z. B. ein Ausflug oder Gutschein</small>
                  </button>
                </div>
                <p className="flow-tip">Tipp: In jeder Shop-App auf <b>Teilen</b> tippen und Päckli wählen. Dann landest du direkt bei Schritt 2.</p>
              </div>
            )}

            {step === "link" && <LinkStep initialUrl={initialUrl} onDone={toDetails} />}

            {step === "details" && draft && (
              <WishForm formId="add-wish" listId={listId} draft={draft} recipient={recipient} onSaved={onSaved} onBusyChange={setBusy} />
            )}
          </div>

          {step === "details" && (
            <footer className="fs-foot">
              <button type="submit" form="add-wish" className="btn block big" disabled={busy}>{busy ? "Wird gespeichert …" : "Auf die Liste setzen"}</button>
            </footer>
          )}
        </>
      )}
    </dialog>
  );
}

/** Schritt 1b: Link einfügen und auswerten. Bei Erfolg geht es automatisch weiter. */
function LinkStep({ initialUrl, onDone }: { initialUrl?: string; onDone: (d: Draft) => void }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("Name, Bild und Preis übernehmen wir, soweit der Shop es zulässt.");
  const [fallback, setFallback] = useState<Draft | null>(null);
  const started = useRef("");

  const run = async (value: string) => {
    const v = value.trim();
    if (!v || started.current === v) return;
    started.current = v;
    setReading(true);
    setFallback(null);
    setMessage("Produktdaten werden gelesen …");
    const r = await readLink(v);
    if (started.current !== v) return; // inzwischen ein anderer Link
    setReading(false);
    setMessage(r.message);
    if (r.draft && r.found) onDone(r.draft);
    else if (r.draft) setFallback(r.draft);
  };

  useEffect(() => { if (initialUrl) run(initialUrl); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) { setUrl(t); run(t); }
    } catch {
      setMessage("Halte lange ins Feld gedrückt und wähle „Einfügen“.");
    }
  };

  return (
    <div className="flow-step">
      <h2 className="flow-title">Link einfügen</h2>
      <label className="field">
        <span className="sr">Link aus einem Shop</span>
        <div className="row">
          <input type="url" inputMode="url" autoFocus={!initialUrl} value={url} placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)} onBlur={() => run(url)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(url); } }}
            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) setTimeout(() => run(t), 0); }} />
          <button type="button" className="btn soft" onClick={paste}>Einfügen</button>
        </div>
        <small className={`detect ${reading ? "busy" : ""}`} role="status">{message}</small>
      </label>
      {fallback && <button type="button" className="btn block big" onClick={() => onDone(fallback)}>Weiter</button>}
    </div>
  );
}
