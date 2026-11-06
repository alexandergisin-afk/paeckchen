import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { OCCASIONS, cover, type GuestList, type GuestWish } from "../lib/types";
import { dateLabel, friendlyError, toast } from "../lib/format";
import { formatPrice } from "../lib/wishes";
import { addCode, getCodes, getLargeText, getName, keepCodes, removeCode, setLargeText, setName } from "../lib/device";
import { IconCheck, IconExt, IconGift } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { PriorityBadge, WishTile } from "../components/WishRow";

interface Mine { code: string; wish_id: string; quantity: number }
type Price = "all" | "20" | "50" | "more";
type GSheet =
  | null
  | { kind: "reserve"; wish: GuestWish }
  | { kind: "done"; wish: GuestWish }
  | { kind: "taken"; available: number }
  | { kind: "cancel"; wish: GuestWish; code: string };

const inPrice = (w: GuestWish, p: Price) =>
  p === "all" || (w.price_cents != null && (p === "20" ? w.price_cents <= 2000 : p === "50" ? w.price_cents <= 5000 : w.price_cents > 5000));

export function GuestPage() {
  const { token = "" } = useParams();
  const { session } = useAuth();
  const [list, setList] = useState<GuestList | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "invalid" | "error">("loading");
  const [price, setPrice] = useState<Price>("all");
  const [large, setLarge] = useState(getLargeText());
  const [sheet, setSheet] = useState<GSheet>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setSheet(null);

  const load = useCallback(async () => {
    const client = db();
    const g = await client.rpc("guest_list", { p_token: token });
    if (g.error) return setState("error");
    if (!g.data || !Array.isArray((g.data as GuestList).wishes)) return setState("invalid");
    let rows: Mine[] = [];
    const codes = getCodes();
    if (codes.length) {
      const m = await client.rpc("my_reservations", { p_codes: codes });
      if (!m.error) {
        rows = m.data as Mine[];
        keepCodes(new Set(rows.map((r) => r.code)));
      }
    }
    setList(g.data as GuestList);
    setMine(rows);
    setState("ok");
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <p className="loading">Wunschliste wird geladen …</p>;
  if (state === "invalid")
    return (
      <div className="wrap narrow">
        <h1>Dieser Link funktioniert nicht mehr.</h1>
        <p className="lead">Die Familie hat ihn erneuert oder die Liste gelöscht. Frag am besten nach dem aktuellen Link.</p>
      </div>
    );
  if (state === "error" || !list)
    return (
      <div className="wrap narrow">
        <h1>Die Liste konnte gerade nicht geladen werden.</h1>
        <p className="lead">Prüf bitte deine Internetverbindung.</p>
        <p style={{ marginTop: 16 }}><button className="btn" onClick={() => { setState("loading"); load(); }}>Erneut versuchen</button></p>
      </div>
    );

  const ids = new Set(list.wishes.map((w) => w.id));
  const myHere = mine.filter((m) => ids.has(m.wish_id));
  const mineOf = (w: GuestWish) => myHere.filter((m) => m.wish_id === w.id);
  const myWishes = list.wishes.filter((w) => mineOf(w).length);
  const open = list.wishes.filter((w) => w.available > 0 && inPrice(w, price));
  const taken = list.wishes.filter((w) => w.available <= 0 && !mineOf(w).length);
  const c = cover(list.cover);
  const meta = [list.recipient_name ? `Für ${list.recipient_name}` : "", list.event_date ? `${OCCASIONS[list.occasion]} am ${dateLabel(list.event_date)}` : ""].filter(Boolean).join(", ");

  const toggleLarge = () => {
    setLargeText(!large);
    setLarge(!large);
  };

  const reserve = async (wish: GuestWish, qty: number, name: string) => {
    setBusy(true);
    const { data, error } = await db().rpc("reserve_wish", { p_token: token, p_wish: wish.id, p_quantity: qty, p_name: name });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    const r = data as { ok: boolean; code?: string; error?: string; available?: number };
    if (r.ok && r.code) {
      addCode(r.code);
      setName(name);
      setSheet({ kind: "done", wish });
    } else if (r.error === "already_taken") setSheet({ kind: "taken", available: r.available ?? 0 });
    else if (r.error === "name_required") return toast("Bitte gib deinen Namen an.");
    else setState("invalid");
    load();
  };

  const cancel = async (code: string) => {
    setBusy(true);
    const { error } = await db().rpc("cancel_reservation", { p_code: code });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    removeCode(code);
    close();
    toast("Reservierung aufgehoben.");
    load();
  };

  const card = (w: GuestWish, mode: "open" | "mine" | "taken") => {
    const my = mineOf(w);
    const myQty = my.reduce((a, m) => a + m.quantity, 0);
    const shop = w.url && (
      <a className="btn line" href={w.url} target="_blank" rel="noopener noreferrer"><IconExt /> {w.shop ? `Bei ${w.shop} ansehen` : "Im Shop ansehen"}</a>
    );
    return (
      <article className={`gcard ${mode === "taken" ? "taken" : ""}`} key={`${mode}-${w.id}`}>
        <WishTile wish={w} wrapped={mode !== "open"} />
        <div className="body">
          <PriorityBadge priority={w.priority} />
          <h3>{w.title}</h3>
          {w.note && mode !== "taken" && <p className="note">{w.note}</p>}
          {w.price_cents != null && <p className="price">{formatPrice(w.price_cents)}</p>}
          {mode === "open" && w.quantity > 1 && <p className="note">Noch {w.available} von {w.quantity} frei</p>}
          {mode === "mine" && <p className="mine-tag"><IconCheck /> Von dir reserviert{myQty > 1 ? ` (${myQty} Stück)` : ""}</p>}
          {mode === "taken" && <p className="note">Schon vergeben</p>}
        </div>
        {mode !== "taken" && (
          <div className="actions">
            {mode === "open" && <button className="btn ribbon" onClick={() => setSheet({ kind: "reserve", wish: w })}><IconGift /> Reservieren</button>}
            {shop}
            {mode === "mine" && my.map((m) => (
              <button key={m.code} className="btn quiet" onClick={() => setSheet({ kind: "cancel", wish: w, code: m.code })}>Reservierung aufheben</button>
            ))}
          </div>
        )}
      </article>
    );
  };

  const chip = (v: Price, t: string) => (
    <button className="fchip" aria-pressed={price === v} onClick={() => setPrice(v)}>{t}</button>
  );

  return (
    <div className="wrap">
      {session && (
        <div className="preview">
          <span><b>Vorschau:</b> So sehen Gäste diese Liste. Namen von Schenkenden sind hier nie sichtbar.</span>
          <Link className="btn small soft" to={`/liste/${list.id}`}>Zur Verwaltung</Link>
        </div>
      )}
      <section className={`ghead t${c.t}`}>
        <span className="emo" aria-hidden="true">{c.e}</span>
        <h1>{list.title}</h1>
        {meta && <p className="lead" style={{ marginTop: 0 }}>{meta}</p>}
        {list.description && <p>{list.description}</p>}
      </section>
      <div className="howto">
        <IconGift />
        <p><b>So geht’s:</b> Such dir ein Geschenk aus und tippe auf „Reservieren“. Dann sehen alle anderen, dass es schon vergeben ist. Ein Konto brauchst du nicht.</p>
      </div>

      {myWishes.length > 0 && (
        <>
          <h2 className="sec" style={{ marginTop: 6 }}>Deine Geschenke</h2>
          <div className="ggrid">{myWishes.map((w) => card(w, "mine"))}</div>
          <h2 className="sec">Noch zu vergeben</h2>
        </>
      )}

      <div className="filters" role="group" aria-label="Nach Preis filtern">
        {chip("all", "Alle")}{chip("20", "bis 20 €")}{chip("50", "bis 50 €")}{chip("more", "über 50 €")}
        <span className="spacer" />
        <button className="fchip" aria-pressed={large} aria-label="Größere Schrift" onClick={toggleLarge}>A+</button>
      </div>

      <div className="ggrid">
        {open.length ? open.map((w) => card(w, "open")) : (
          <div className="empty" style={{ gridColumn: "1/-1" }}>
            <p>{price !== "all" ? "In dieser Preisklasse ist gerade nichts frei." : list.wishes.length ? "Alle Wünsche sind schon vergeben. Wie schön!" : "Auf dieser Liste stehen noch keine Wünsche."}</p>
            {price !== "all" && <button className="btn soft" onClick={() => setPrice("all")}>Alle Preise zeigen</button>}
          </div>
        )}
      </div>

      {taken.length > 0 && (
        <details className="arch">
          <summary>Schon vergeben ({taken.length})</summary>
          <div className="ggrid" style={{ marginTop: 12 }}>{taken.map((w) => card(w, "taken"))}</div>
        </details>
      )}

      <p className="hint" style={{ marginTop: 34, textAlign: "center" }}>
        Auf einem anderen Gerät reserviert oder umentschieden? Sag einfach der Familie Bescheid, dann wird die Reservierung freigegeben.
      </p>

      <Sheet open={sheet?.kind === "reserve"} onClose={close} label="Wunsch reservieren">
        {sheet?.kind === "reserve" && <ReserveForm wish={sheet.wish} busy={busy} onSubmit={(q, n) => reserve(sheet.wish, q, n)} />}
      </Sheet>

      <Sheet open={sheet?.kind === "done"} onClose={close} label="Reservierung bestätigt">
        {sheet?.kind === "done" && (
          <>
            <h2>Reserviert!</h2>
            <WishTile wish={sheet.wish} wrapped animate className="confirm-tile" />
            <p>„{sheet.wish.title}“ ist jetzt für dich reserviert. Alle anderen sehen nur noch: vergeben.</p>
            {sheet.wish.url && (
              <p style={{ marginTop: 14 }}>
                <a className="btn line block" href={sheet.wish.url} target="_blank" rel="noopener noreferrer"><IconExt /> Zum Shop</a>
              </p>
            )}
            <p className="hint" style={{ marginTop: 12 }}>
              Dieses Gerät merkt sich deine Reservierung. Hier kannst du sie jederzeit wieder aufheben. Von einem anderen Gerät aus sag einfach der Familie Bescheid.
            </p>
            <button className="btn block" onClick={close} style={{ marginTop: 14 }}>Fertig</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "taken"} onClose={close} label="Hinweis">
        {sheet?.kind === "taken" && (
          <>
            <h2>Da war jemand schneller.</h2>
            <p>{sheet.available > 0 ? `Es sind nur noch ${sheet.available} frei.` : "Dieser Wunsch ist gerade vergeben worden."} Schau dir gern die anderen Wünsche an.</p>
            <button className="btn block" onClick={close} style={{ marginTop: 16 }}>Zur Liste</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "cancel"} onClose={close} label="Reservierung aufheben">
        {sheet?.kind === "cancel" && (
          <>
            <h2>Reservierung aufheben?</h2>
            <p>„{sheet.wish.title}“ ist danach wieder für alle frei.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn danger" disabled={busy} onClick={() => cancel(sheet.code)}>Ja, aufheben</button>
              <button className="btn soft" onClick={close}>Behalten</button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

function ReserveForm({ wish, busy, onSubmit }: { wish: GuestWish; busy: boolean; onSubmit: (qty: number, name: string) => void }) {
  const [name, setNameValue] = useState(getName());
  const [qty, setQty] = useState("1");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(Math.max(1, Math.min(wish.available, Number.parseInt(qty) || 1)), name.trim());
  };
  return (
    <>
      <h2>Reservieren: {wish.title}</h2>
      <p>Damit sagst du: <b>Um dieses Geschenk kümmere ich mich.</b> Alle anderen sehen dann, dass es vergeben ist. Kaufen kannst du es danach in Ruhe, wo du möchtest.</p>
      <form onSubmit={submit} style={{ marginTop: 16 }}>
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
        <button className="btn ribbon block" type="submit" disabled={busy}><IconGift /> {busy ? "Wird reserviert …" : "Jetzt reservieren"}</button>
      </form>
    </>
  );
}
