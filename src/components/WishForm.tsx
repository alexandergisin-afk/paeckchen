import { useEffect, useRef, useState, type FormEvent } from "react";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { PRIORITIES, type Priority, type Wish } from "../lib/types";
import { detectFromUrl, imageUrl, parsePrice, priceInput, removeImage, resizeImage, uploadImage } from "../lib/wishes";
import { friendlyError, toast } from "../lib/format";
import { ProductSearch, type SearchResult } from "./ProductSearch";

interface Props {
  listId: string;
  wish?: Wish;
  onSaved: () => void;
}

export function WishForm({ listId, wish, onSaved }: Props) {
  const { session } = useAuth();
  const edit = !!wish;
  const [url, setUrl] = useState(wish?.url ?? "");
  const [title, setTitle] = useState(wish?.title ?? "");
  const [price, setPrice] = useState(priceInput(wish?.price_cents ?? null));
  const [qty, setQty] = useState(String(wish?.quantity ?? 1));
  const [priority, setPriority] = useState<Priority>(wish?.priority ?? "nice");
  const [note, setNote] = useState(wish?.note ?? "");
  const [shop, setShop] = useState(wish?.shop ?? "");
  const [detectMsg, setDetectMsg] = useState("Name, Bild und Preis übernehmen wir, soweit der Shop es zulässt.");
  const [newImage, setNewImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl(wish?.image_path ?? null));
  const [dropImage, setDropImage] = useState(false);
  const [remoteImage, setRemoteImage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const lastFetched = useRef("");
  const [busy, setBusy] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Vorschau-Adressen wieder freigeben
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const detect = (value: string) => {
    if (!value.trim()) return;
    const d = detectFromUrl(value);
    if (!d) return setDetectMsg("Das sieht noch nicht nach einem vollständigen Link aus.");
    // Sofort: Shop und Name aus der Adresse. Danach, falls möglich: Name, Bild und Preis von der Shopseite.
    setShop((s) => s || d.shop);
    setTitle((t) => t || d.title);
    if (edit || lastFetched.current === d.url) return;
    lastFetched.current = d.url;
    readShopPage(d.url, d.title, d.shop);
  };

  const readShopPage = async (pageUrl: string, urlTitle: string, urlShop: string) => {
    setReading(true);
    setDetectMsg("Produktdaten werden gelesen …");
    let p: { title?: string | null; image?: string | null; price_cents?: number | null; shop?: string | null; error?: string; status?: number } | null = null;
    let unreachable = "";
    try {
      const { data, error } = await db().functions.invoke("link-vorschau", { body: { url: pageUrl } });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        unreachable = status === 401 ? "Anmeldung abgelehnt, Code 401" : status === 404 ? "Funktion nicht gefunden, Code 404" : status ? `Code ${status}` : "keine Verbindung";
      } else p = data;
    } catch {
      unreachable = "keine Verbindung";
    }
    setReading(false);
    if (lastFetched.current !== pageUrl) return; // inzwischen ein anderer Link
    const found: string[] = [];
    if (p && !p.error) {
      if (p.title) { setTitle((t) => (!t || t === urlTitle ? p!.title! : t)); found.push("Name"); }
      if (p.image) { setRemoteImage(p.image); if (!newImage) { setPreview(p.image); setDropImage(false); } found.push("Bild"); }
      if (p.price_cents != null) { setPrice((v) => v || priceInput(p!.price_cents!)); found.push("Preis"); }
      if (p.shop && p.shop.length <= 30) setShop((s) => (!s || s === urlShop ? p!.shop! : s));
    }
    // Klare Rückmeldung, woran es lag. Die Angabe in Klammern hilft bei der Fehlersuche.
    const reason = unreachable
      ? `Die automatische Erkennung ist gerade nicht erreichbar (${unreachable}).`
      : p?.error === "blocked"
        ? `${urlShop} lässt das automatische Auslesen nicht zu${p.status && p.status !== 200 ? ` (${p.status})` : ""}.`
        : p?.error === "timeout"
          ? `${urlShop} hat zu lange nicht geantwortet.`
          : p?.error
            ? `Die Seite konnte nicht gelesen werden (${p.error}${p.status ? `, ${p.status}` : ""}).`
            : `${urlShop} gibt keine Produktdaten heraus.`;
    if (found.length) {
      setDetectMsg(`Gefunden: ${found.join(", ")}. Kurz prüfen und speichern.`);
      if (!found.includes("Preis")) setTimeout(() => priceRef.current?.focus(), 0);
    } else if (urlTitle) {
      setDetectMsg(`${reason} Den Namen haben wir aus dem Link übernommen, ergänze bitte den Preis.`);
      setTimeout(() => priceRef.current?.focus(), 0);
    } else {
      setDetectMsg(`${reason} Trag den Namen bitte selbst ein.`);
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  };

  const pickResult = (r: SearchResult) => {
    lastFetched.current = r.url; // keine zusätzliche Link-Erkennung nötig
    setUrl(r.url);
    setTitle(r.title);
    setShop(r.shop);
    if (r.price_cents != null) setPrice(priceInput(r.price_cents));
    setRemoteImage(r.image);
    if (!newImage) { setPreview(r.image); setDropImage(false); }
    setDetectMsg("Aus der Suche übernommen.");
    setTimeout(() => titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        setUrl(t);
        detect(t);
      }
    } catch {
      setDetectMsg("Halte lange ins Feld gedrückt und wähle „Einfügen“.");
    }
  };

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
    if (!title.trim()) return titleRef.current?.focus();
    const cleanUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : null;
    setBusy(true);
    try {
      let image_path = wish?.image_path ?? null;
      if (newImage) image_path = await uploadImage(listId, newImage);
      else if (dropImage) image_path = null;
      else if (!edit && remoteImage) image_path = remoteImage;

      const row = {
        title: title.trim(),
        url: cleanUrl,
        shop: shop.trim() || null,
        price_cents: parsePrice(price),
        quantity: Math.max(1, Math.min(20, Number.parseInt(qty) || 1)),
        priority,
        note: note.trim() || null,
        image_path,
      };
      const { error } = edit
        ? await db().from("wishes").update(row).eq("id", wish!.id)
        : await db().from("wishes").insert({ ...row, list_id: listId, created_by: session!.user.id });
      if (error) {
        if (newImage) await removeImage(image_path); // hochgeladenes Bild nicht verwaisen lassen
        if (/quantity_below_reserved/.test(error.message)) throw new Error("Die Menge kann nicht kleiner sein als die bereits reservierte Anzahl.");
        throw error;
      }
      if (edit && wish!.image_path && wish!.image_path !== image_path) await removeImage(wish!.image_path);
      toast(edit ? "Änderungen gespeichert." : "Wunsch gespeichert.");
      onSaved();
    } catch (err) {
      const m = (err as Error).message;
      toast(m.startsWith("Die Menge") ? m : friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {!edit && (
        <>
          <ProductSearch onPick={pickResult} />
          <p className="or-sep"><span>oder</span></p>
          <label className="field">
            <span>Link aus einem Shop einfügen</span>
            <div className="row">
              <input type="url" inputMode="url" value={url} placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)} onBlur={() => detect(url)}
                onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) setTimeout(() => detect(t), 0); }} />
              <button type="button" className="btn soft" onClick={paste}>Einfügen</button>
            </div>
            <small className={`detect ${reading ? "busy" : ""}`}>{detectMsg}</small>
          </label>
        </>
      )}

      <label className="field">
        <span>Was wird gewünscht?</span>
        <input ref={titleRef} required maxLength={200} value={title} autoFocus={edit} placeholder="z. B. Hörspiel „Pumuckl“" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="two">
        <label className="field">
          <span>Preis, ca.</span>
          <input ref={priceRef} inputMode="decimal" value={price} placeholder="0,00 €" onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Menge</span>
          <input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
      </div>
      <fieldset className="field">
        <legend>Wie wichtig?</legend>
        <div className="chips">
          {(Object.keys(PRIORITIES) as Priority[]).map((p) => (
            <label className="chip" key={p}>
              <input type="radio" name="priority" checked={priority === p} onChange={() => setPriority(p)} />
              <span>{PRIORITIES[p].icon} {PRIORITIES[p].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Notiz (optional)</span>
        <input maxLength={300} value={note} placeholder="z. B. Größe 34, gern in Blau" onChange={(e) => setNote(e.target.value)} />
      </label>

      <details open={(edit && Boolean(wish?.shop || wish?.image_path)) || Boolean(remoteImage)}>
        <summary>Shop, Link und eigenes Bild</summary>
        <label className="field">
          <span>Shop</span>
          <input maxLength={60} value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        {edit && (
          <label className="field">
            <span>Link</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        )}
        <div className="field">
          <span>Eigenes Bild</span>
          <input type="file" accept="image/*" aria-label="Bild auswählen" onChange={(e) => pickImage(e.target.files?.[0])} />
          {preview && !dropImage ? (
            <div className="imgprev">
              <img src={preview} alt="Vorschau" referrerPolicy="no-referrer" onError={() => setPreview(null)} />
              <button type="button" className="btn quiet" onClick={() => { setDropImage(true); setNewImage(null); }}>Bild entfernen</button>
            </div>
          ) : (
            <small>Ein Foto vom Spielzeug im Laden geht auch.</small>
          )}
        </div>
      </details>

      <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Wird gespeichert …" : edit ? "Änderungen speichern" : "Wunsch speichern"}
      </button>
    </form>
  );
}
