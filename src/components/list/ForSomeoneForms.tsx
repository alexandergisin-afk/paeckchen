// Eltern tragen für jemanden ein: Reservierung oder Beitrag zu einem Gruppengeschenk
import { useState } from "react";
import { type Wish } from "../../lib/types";
import { parsePrice } from "../../lib/wishes";
import { euroShort } from "../../lib/gift";

/** Eltern tragen eine Reservierung für jemanden ein, z. B. nach einem Anruf von Oma. */
export function ReserveForForm({ wish, free, busy, onSubmit }: {
  wish: Wish; free: number; busy: boolean; onSubmit: (name: string, qty: number, parentsBuy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [parentsBuy, setParentsBuy] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim(), qty, parentsBuy); }}>
      <h2>Für jemanden reservieren</h2>
      <p className="hint mb-14">„{wish.title}“ wird für diese Person reserviert, zum Beispiel wenn sie angerufen hat. Alle anderen sehen dann: vergeben.</p>
      <label className="field">
        <span>Für wen?</span>
        <input required autoFocus maxLength={60} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setName(e.target.value)} />
      </label>
      {free > 1 && (
        <div className="qty-row">
          <span className="qty-label">Wie viele? <span className="optional">(noch {free} frei)</span></span>
          <div className="stepper" role="group" aria-label="Menge">
            <button type="button" aria-label="Weniger" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <output>{qty}</output>
            <button type="button" aria-label="Mehr" disabled={qty >= free} onClick={() => setQty(qty + 1)}>+</button>
          </div>
        </div>
      )}
      <label className="switch my-6-18">
        <input type="checkbox" checked={parentsBuy} onChange={(e) => setParentsBuy(e.target.checked)} />
        <span><b>Wir besorgen das Geschenk</b><br /><span className="hint">Die Person gibt euch das Geld, ihr kauft es.</span></span>
      </label>
      <button type="submit" className="btn block big" disabled={busy}>{busy ? "Wird reserviert …" : "Reservieren"}</button>
    </form>
  );
}

/** Eltern tragen einen Beitrag für jemanden ein (z. B. „Oma gibt 50 € dazu“). */
export function ContributeForForm({ wish, open, busy, onSubmit }: { wish: Wish; open: number; busy: boolean; onSubmit: (name: string, amount: number) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const cents = parsePrice(amount);
  const ok = !!name.trim() && cents != null && cents >= Math.min(500, open) && cents <= open;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(name.trim(), cents!); }}>
      <h2>Beitrag eintragen</h2>
      <p className="hint mb-14">Für „{wish.title}“ fehlen noch {euroShort(open)}.</p>
      <label className="field">
        <span>Von wem?</span>
        <input required autoFocus maxLength={60} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Betrag</span>
        <input required inputMode="decimal" value={amount} placeholder="z. B. 50" onChange={(e) => setAmount(e.target.value)} />
        {cents != null && cents > open && <small className="field-error">Höchstens {euroShort(open)}.</small>}
      </label>
      <button type="submit" className="btn block big" disabled={busy || !ok}>{busy ? "Wird eingetragen …" : cents ? `${euroShort(cents)} eintragen` : "Eintragen"}</button>
    </form>
  );
}
