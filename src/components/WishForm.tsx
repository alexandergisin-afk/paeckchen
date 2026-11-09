import { useEffect, useRef, useState, type FormEvent } from "react";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { type Priority, type Wish } from "../lib/types";
import { formatPrice, imageUrl, parsePrice, priceInput, removeImage, resizeImage, uploadImage } from "../lib/wishes";
import type { Draft } from "../lib/linkPreview";
import { friendlyError, toast } from "../lib/format";

/** Die drei Stufen, jeweils mit kurzer Erklärung: macht die wichtigste Entscheidung leichter. */
const PRIO_CHOICES: { value: Priority; label: string; hint: string }[] = [
  { value: "heart", label: "Herzenswunsch", hint: "Steht ganz oben auf der Liste" },
  { value: "nice", label: "Wäre schön", hint: "Würde sich sehr freuen" },
  { value: "small", label: "Kleine Aufmerksamkeit", hint: "Gut für ein Mitbringsel" },
];

interface Props {
  listId: string;
  /** Bestehender Wunsch (Bearbeiten) … */
  wish?: Wish;
  /** … oder Entwurf aus Schritt 1 (Suche, Link oder selbst eintragen). */
  draft?: Draft;
  formId: string;
  recipient?: string | null;
  onSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
}

/** Schritt 2: die Details eines Wunsches. Wird auch zum Bearbeiten verwendet. */
export function WishForm({ listId, wish, draft, formId, recipient, onSaved, onBusyChange }: Props) {
  const { session } = useAuth();
  const edit = !!wish;
  const [url, setUrl] = useState(wish?.url ?? draft?.url ?? "");
  const [title, setTitle] = useState(wish?.title ?? draft?.title ?? "");
  const [price, setPrice] = useState(priceInput(wish?.price_cents ?? draft?.price_cents ?? null));
  const [qty, setQty] = useState(wish?.quantity ?? 1);
  const [priority, setPriority] = useState<Priority>(wish?.priority ?? "nice");
  const [note, setNote] = useState(wish?.note ?? "");
  const [groupGift, setGroupGift] = useState(!!wish?.group_gift);
  const [shop, setShop] = useState(wish?.shop ?? draft?.shop ?? "");
  const [newImage, setNewImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl(wish?.image_path ?? draft?.image ?? null));
  const [dropImage, setDropImage] = useState(false);
  // Bekannte Produkte zeigen eine Karte; Name und Preis erst auf Wunsch bearbeitbar
  const [basicsOpen, setBasicsOpen] = useState(!(edit || (draft && draft.source !== "manual" && draft.title)));
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await resizeImage(file);
      setNewImage(blob);
      setDropImage(false);
      setPreview(URL.createObjectURL(blob));
    } catch {
      toast("Dieses Bild konnte nicht gelesen werden. Versuch ein JPG oder PNG.");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setBasicsOpen(true);
      setTimeout(() => titleRef.current?.focus(), 0);
      return toast("Bitte gib dem Wunsch einen Namen.");
    }
    const cleanUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : null;
    setBusy(true);
    try {
      let image_path = wish?.image_path ?? null;
      if (newImage) image_path = await uploadImage(listId, newImage);
      else if (dropImage) image_path = null;
      else if (!edit && draft?.image) image_path = draft.image;

      const row = {
        title: title.trim(), url: cleanUrl, shop: shop.trim() || null, price_cents: parsePrice(price),
        quantity: qty, priority, note: note.trim() || null, image_path,
        group_gift: groupGift && parsePrice(price) != null,
      };
      const { error } = edit
        ? await db().from("wishes").update(row).eq("id", wish!.id)
        : await db().from("wishes").insert({ ...row, list_id: listId, created_by: session!.user.id });
      if (error) {
        if (newImage) await removeImage(image_path); // hochgeladenes Bild nicht verwaisen lassen
        if (/quantity_below_reserved/.test(error.message)) throw new Error("Die Menge kann nicht kleiner sein als die bereits reservierte Anzahl.");
        if (/group_gift_has_reservations/.test(error.message)) throw new Error("Die Einstellung „Gemeinsam schenken“ lässt sich nicht mehr ändern, weil es schon Reservierungen oder Beiträge gibt.");
        throw error;
      }
      if (edit && wish!.image_path && wish!.image_path !== image_path) await removeImage(wish!.image_path);
      toast(edit ? "Änderungen gespeichert." : "Wunsch steht auf der Liste.");
      onSaved();
    } catch (err) {
      const m = (err as Error).message;
      toast(m.startsWith("Die Menge") || m.startsWith("Die Einstellung") ? m : friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const showPreview = preview && !dropImage;
  const parsed = parsePrice(price);

  return (
    <form id={formId} onSubmit={submit} className="wish-details">
      {!basicsOpen ? (
        <section className="product-card">
          <span className="product-img">
            {showPreview ? <img src={preview!} alt="" referrerPolicy="no-referrer" onError={() => setPreview(null)} /> : <span aria-hidden="true">🎁</span>}
          </span>
          <div className="product-text">
            <b className="product-title">{title}</b>
            <span className="product-meta">
              {parsed != null && <b className="product-price">{formatPrice(parsed)}</b>}
              {shop && <span> bei {shop}</span>}
            </span>
            <button type="button" className="link-btn" onClick={() => { setBasicsOpen(true); setTimeout(() => titleRef.current?.focus(), 0); }}>
              Name oder Preis ändern
            </button>
          </div>
        </section>
      ) : (
        <div className={`title-row ${showPreview ? "has-img" : ""}`}>
          {showPreview && <img className="title-img" src={preview!} alt="" referrerPolicy="no-referrer" onError={() => setPreview(null)} />}
          <div>
            <label className="field">
              <span>Was wird gewünscht?</span>
              <input ref={titleRef} required maxLength={200} value={title} autoFocus={!edit && draft?.source === "manual"}
                placeholder="z. B. Ein Tag im Kletterwald" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Preis, ca. <span className="optional">(optional)</span></span>
              <input inputMode="decimal" value={price} placeholder="0,00 €" onChange={(e) => setPrice(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <fieldset className="field prio-list">
        <legend>Wie wichtig ist es {recipient?.trim() || "dem Kind"}?</legend>
        {PRIO_CHOICES.map((p) => (
          <label className={`prio-option prio-${p.value}`} key={p.value}>
            <input type="radio" name={`${formId}-priority`} checked={priority === p.value} onChange={() => setPriority(p.value)} />
            <span className="prio-box">
              <span className="prio-icon" aria-hidden="true">{p.value === "heart" ? "♥" : p.value === "nice" ? "✦" : "🎁"}</span>
              <span><b>{p.label}</b><small>{p.hint}</small></span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="qty-row">
        <span id={`${formId}-menge`} className="qty-label">Wie viele?</span>
        <div className="stepper" role="group" aria-labelledby={`${formId}-menge`}>
          <button type="button" aria-label="Weniger" disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <output aria-live="polite">{qty}</output>
          <button type="button" aria-label="Mehr" disabled={qty >= 20} onClick={() => setQty(Math.min(20, qty + 1))}>+</button>
        </div>
      </div>

      <label className={`switch group-switch ${parsed == null ? "is-disabled" : ""}`}>
        <input type="checkbox" checked={groupGift && parsed != null} disabled={parsed == null} onChange={(e) => setGroupGift(e.target.checked)} />
        <span>
          <b>Gemeinsam schenken erlauben</b><br />
          <span className="hint">{parsed == null
            ? "Dafür braucht der Wunsch einen Preis."
            : "Gäste können einen Betrag beisteuern. Ihr kauft das Geschenk, sobald alles zusammen ist."}</span>
        </span>
      </label>

      <label className="field">
        <span>Hinweis für die Schenkenden <span className="optional">(optional)</span></span>
        <input maxLength={300} value={note} placeholder="z. B. Größe 34, gern in Blau" onChange={(e) => setNote(e.target.value)} />
      </label>

      <details className="more-details">
        <summary>Weitere Angaben <small>Shop, Link, eigenes Foto</small></summary>
        <label className="field">
          <span>Shop</span>
          <input maxLength={60} value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        <label className="field">
          <span>Link</span>
          <input type="url" inputMode="url" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="field">
          <span>Eigenes Foto</span>
          <input type="file" accept="image/*" aria-label="Foto auswählen" onChange={(e) => pickImage(e.target.files?.[0])} />
          {showPreview ? (
            <div className="imgprev">
              <span className="hint">Ein Bild ist hinterlegt.</span>
              <button type="button" className="btn quiet" onClick={() => { setDropImage(true); setNewImage(null); }}>Bild entfernen</button>
            </div>
          ) : (
            <small>Ein Foto vom Spielzeug im Laden geht auch.</small>
          )}
        </div>
      </details>
    </form>
  );
}
