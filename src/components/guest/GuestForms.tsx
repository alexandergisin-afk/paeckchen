// Gästeansicht: Reservieren und Mitschenken
import { useState, type FormEvent } from "react";
import { type GuestWish } from "../../lib/types";
import { parsePrice } from "../../lib/wishes";
import { euroShort } from "../../lib/gift";
import { getName } from "../../lib/device";
import { IconGift } from "../../components/Icons";

export function ReserveForm({ wish, allowParentsBuy, busy, onSubmit, whole = false }: { wish: GuestWish; allowParentsBuy: boolean; busy: boolean; onSubmit: (qty: number, name: string, parentsBuy: boolean) => void; whole?: boolean }) {
  const [name, setNameValue] = useState(getName());
  const [qty, setQty] = useState("1");
  const [parentsBuy, setParentsBuy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(Math.max(1, Math.min(wish.available, Number.parseInt(qty) || 1)), name.trim(), !whole && allowParentsBuy && parentsBuy);
  };
  if (whole) {
    // Gruppengeschenk ganz übernehmen: selbst besorgen, ohne Stückzahl und ohne „Bitte besorgt ihr es“
    return (
      <>
        <h2>„{wish.title}“ ganz übernehmen</h2>
        <p>Du übernimmst das ganze Geschenk{wish.price_cents != null ? ` (${euroShort(wish.price_cents)})` : ""} und <b>besorgst es selbst</b>. Alle anderen sehen dann, dass es vergeben ist.</p>
        <form className="mt-16" onSubmit={submit}>
          <label className="field">
            <span>Dein Name</span>
            <input required maxLength={60} autoComplete="name" autoFocus={!name} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setNameValue(e.target.value)} />
            <small>Damit die Eltern wissen, von wem das Geschenk kommt. Andere Gäste sehen deinen Namen nie.</small>
          </label>
          <button className="btn ribbon block" type="submit" disabled={busy}><IconGift /> {busy ? "Wird reserviert …" : "Ganz übernehmen"}</button>
        </form>
      </>
    );
  }
  return (
    <>
      <h2>Reservieren: {wish.title}</h2>
      <p>Damit sagst du: <b>Um dieses Geschenk kümmere ich mich.</b> Alle anderen sehen dann, dass es vergeben ist. Kaufen kannst du es danach in Ruhe, wo du möchtest.</p>
      <form className="mt-16" onSubmit={submit}>
        {wish.available > 1 && (
          <label className="field">
            <span>Wie viele schenkst du?</span>
            <input type="number" min={1} max={wish.available} value={qty} onChange={(e) => setQty(e.target.value)} />
            <small>Noch {wish.available} frei.</small>
          </label>
        )}
        <label className="field">
          <span>Dein Name</span>
          <input required maxLength={60} autoComplete="name" autoFocus={!name} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setNameValue(e.target.value)} />
          <small>Damit die Eltern wissen, von wem das Geschenk kommt. Andere Gäste sehen deinen Namen nie.</small>
        </label>
        {allowParentsBuy && (
          <label className="switch parents-buy">
            <input type="checkbox" checked={parentsBuy} onChange={(e) => setParentsBuy(e.target.checked)} />
            <span><b>Bitte besorgt ihr das Geschenk</b><br /><span className="hint">Die Eltern kaufen es für dich, du gibst ihnen das Geld.</span></span>
          </label>
        )}
        <button className="btn ribbon block" type="submit" disabled={busy}><IconGift /> {busy ? "Wird reserviert …" : "Jetzt reservieren"}</button>
      </form>
    </>
  );
}
/** Betrag fürs Gruppengeschenk wählen: Vorschläge, eigener Betrag oder der ganze Rest. */
export function ContributeForm({ wish, busy, onSubmit, onTakeWhole }: { wish: GuestWish; busy: boolean; onSubmit: (amount: number, name: string) => void; onTakeWhole: () => void }) {
  const open = Math.max(0, (wish.target_cents ?? 0) - (wish.funded_cents ?? 0));
  const empty = (wish.funded_cents ?? 0) === 0;   // noch niemand hat beigesteuert
  const [name, setNameValue] = useState(getName());
  const [custom, setCustom] = useState("");
  const [chip, setChip] = useState<number | null>(null);
  const presets = [2000, 5000, 10000].filter((c) => c < open);
  const amount = chip ?? parsePrice(custom);
  // Den vollen Betrag als ersten Beitrag gibt es nicht: Wer alles übernimmt, besorgt es selbst
  const wholeAmount = empty && amount != null && amount === open;
  const valid = amount != null && amount >= Math.min(500, open) && amount <= open && !wholeAmount && !!name.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(amount!, name.trim()); }}>
      <h2>Bei „{wish.title}“ mitschenken</h2>
      <p className="hint mb-14">Noch offen: {euroShort(open)}. Wie viel möchtest du beisteuern?</p>
      {(
        <div className="amount-chips" role="group" aria-label="Betrag">
          {presets.map((c) => (
            <button key={c} type="button" className="amount-chip" aria-pressed={chip === c} onClick={() => { setChip(c); setCustom(""); }}>{euroShort(c)}</button>
          ))}
          {empty
            ? <button type="button" className="amount-chip" onClick={onTakeWhole}>Ganz<br /><small>{euroShort(open)}</small></button>
            : <button type="button" className="amount-chip" aria-pressed={chip === open} onClick={() => { setChip(open); setCustom(""); }}>Rest<br /><small>{euroShort(open)}</small></button>}
        </div>
      )}
      {(
        <label className="field">
          <span>Anderer Betrag</span>
          <input inputMode="decimal" value={custom} placeholder="z. B. 30" onChange={(e) => { setCustom(e.target.value); setChip(null); }} />
          {chip == null && amount != null && amount > open && <small className="field-error">Höchstens {euroShort(open)}.</small>}
          {chip == null && amount != null && amount < Math.min(500, open) && <small className="field-error">Mindestens {euroShort(Math.min(500, open))}.</small>}
        </label>
      )}
      {wholeAmount && (
        <div className="notice mb-14" role="status">
          <p className="m-0">Mit dem ganzen Betrag übernimmst du das Geschenk komplett. Dann <b>besorgst du es selbst</b>, statt den Eltern das Geld zu geben.</p>
          <button type="button" className="btn soft small mt-10" onClick={onTakeWhole}>Ganz übernehmen und selbst besorgen</button>
        </div>
      )}
      <label className="field">
        <span>Dein Name</span>
        <input required maxLength={60} autoComplete="name" value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setNameValue(e.target.value)} />
        <small>Andere Gäste sehen nur die Summe, nicht wer wie viel gibt. Das Geld gibst du den Eltern direkt.</small>
      </label>
      <button className="btn ribbon block" type="submit" disabled={busy || !valid}>
        <IconGift /> {busy ? "Wird eingetragen …" : amount ? `${euroShort(amount)} beisteuern` : "Beisteuern"}
      </button>
    </form>
  );
}
