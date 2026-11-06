import { useState, type FormEvent } from "react";
import { COVERS, OCCASIONS, type Occasion, type WishList } from "../lib/types";

export interface ListInput {
  title: string;
  recipient_name: string;
  occasion: Occasion;
  event_date: string;
  cover: number;
  description: string;
}

export function ListForm({ list, busy, onSubmit }: { list?: WishList; busy: boolean; onSubmit: (v: ListInput) => void }) {
  const [v, setV] = useState<ListInput>({
    title: list?.title ?? "",
    recipient_name: list?.recipient_name ?? "",
    occasion: list?.occasion ?? "birthday",
    event_date: list?.event_date ?? "",
    cover: list?.cover ?? 0,
    description: list?.description ?? "",
  });
  const set = <K extends keyof ListInput>(k: K, val: ListInput[K]) => setV((o) => ({ ...o, [k]: val }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return;
    onSubmit({ ...v, title: v.title.trim(), recipient_name: v.recipient_name.trim(), description: v.description.trim() });
  };

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Name der Liste</span>
        <input required maxLength={120} autoFocus value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. Emmas 10. Geburtstag" />
      </label>
      <label className="field">
        <span>Für wen?</span>
        <input maxLength={60} value={v.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} placeholder="z. B. Emma" />
      </label>
      <fieldset className="field">
        <legend>Anlass</legend>
        <div className="chips">
          {(Object.keys(OCCASIONS) as Occasion[]).map((k) => (
            <label className="chip" key={k}>
              <input type="radio" name="occasion" checked={v.occasion === k} onChange={() => set("occasion", k)} />
              <span>{OCCASIONS[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Datum (optional)</span>
        <input type="date" value={v.event_date} onChange={(e) => set("event_date", e.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Bild</legend>
        <div className="chips">
          {COVERS.map((c, i) => (
            <label className="chip" key={i}>
              <input type="radio" name="cover" checked={v.cover === i} onChange={() => set("cover", i)} />
              <span aria-label={`Motiv ${i + 1}`} style={{ fontSize: "1.4rem" }}>{c.e}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Ein Satz für die Schenkenden (optional)</span>
        <textarea maxLength={1000} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="z. B. Emma bastelt und liest gerade am liebsten." />
      </label>
      <button className="btn block" type="submit" disabled={busy}>
        {busy ? "Wird gespeichert …" : list ? "Änderungen speichern" : "Liste anlegen"}
      </button>
    </form>
  );
}

/** Wandelt Formularwerte in Datenbankfelder um (leere Felder werden zu null). */
export const toRow = (v: ListInput) => ({
  title: v.title,
  recipient_name: v.recipient_name || null,
  occasion: v.occasion,
  event_date: v.event_date || null,
  cover: v.cover,
  description: v.description || null,
});
