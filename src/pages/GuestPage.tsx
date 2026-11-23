import { useCallback, useEffect, useState } from "react";
import { SkeletonGuest } from "../components/Skeleton";
import { usePullToRefresh, useRefreshOnReturn } from "../lib/useRefresh";
import { PullIndicator } from "../components/PullIndicator";
import { Link, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { OCCASIONS, cover, type GuestList, type GuestWish } from "../lib/types";
import { dateLabel, friendlyError, toast } from "../lib/format";
import { formatPrice } from "../lib/wishes";
import { euroShort } from "../lib/gift";
import { celebrate } from "../lib/celebrate";
import { cached, remember } from "../lib/cache";
import { forgetGuestList, rememberGuestList } from "../lib/guestLists";
import { syncDeviceToAccount } from "../lib/followed";
import { addCode, getCodes, getName, keepCodes, removeCode, setName } from "../lib/device";
import { IconCheck, IconExt, IconGift, IconGrid, IconRows } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { PriorityBadge, WishTile } from "../components/WishRow";
import { getItem, hasFlag, KEYS, setFlag, setItem } from "../lib/storage";
import { ReserveForm, ContributeForm } from "../components/guest/GuestForms";
import { GuestFooter } from "../components/guest/GuestFooter";
import { useAppStartUrl } from "../lib/useAppStartUrl";

/** Eigene Reservierung: per Code (Gerät) oder am Konto (id, angemeldet) */
interface Mine { code: string; id?: string; wish_id: string; quantity: number; amount_cents?: number | null }
type Price = "all" | "20" | "50" | "more";
type GSheet =
  | null
  | { kind: "details"; wish: GuestWish; mode: "open" | "mine" }
  | { kind: "reserve"; wish: GuestWish }
  | { kind: "contribute"; wish: GuestWish; full: boolean }
  | { kind: "contributed"; wish: GuestWish; amount: number; complete: boolean }
  | { kind: "giftInfo"; text: string }
  | { kind: "done"; wish: GuestWish; parentsBuy: boolean }
  | { kind: "taken"; available: number }
  | { kind: "cancel"; wish: GuestWish; code: string; id?: string };

const inPrice = (w: GuestWish, p: Price) =>
  p === "all" || (w.price_cents != null && (p === "20" ? w.price_cents <= 2000 : p === "50" ? w.price_cents <= 5000 : w.price_cents > 5000));

export function GuestPage() {
  const { token = "" } = useParams();
  const { session, displayName } = useAuth();
  // Zuletzt geladenen Stand sofort zeigen (auch offline), frisch geladen wird im Hintergrund
  const [list, setList] = useState<GuestList | null>(() => cached<{ list: GuestList }>(`guest:${token}`)?.list ?? null);
  const [mine, setMine] = useState<Mine[]>(() => cached<{ mine: Mine[] }>(`guest:${token}`)?.mine ?? []);
  const [state, setState] = useState<"loading" | "ok" | "invalid" | "error">(() => (cached(`guest:${token}`) ? "ok" : "loading"));
  const [price, setPrice] = useState<Price>("all");
  const [sheet, setSheet] = useState<GSheet>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"rows" | "grid">(() => {
    return getItem(KEYS.guestView) === "rows" ? "rows" : "grid";
  });
  const chooseView = (v: "rows" | "grid") => {
    setView(v);
    setItem(KEYS.guestView, v);
  };
  const close = () => setSheet(null);

  const load = useCallback(async () => {
    const client = db();
    const g = await client.rpc("guest_list", { p_token: token });
    if (g.error) {
      // Ohne Netz: zuletzt geladenen Stand zeigen, wenn es einen gibt
      const off = cached<{ list: GuestList; mine: Mine[] }>(`guest:${token}`);
      if (off) { setList(off.list); setMine(off.mine); return setState("ok"); }
      return setState("error");
    }
    if (!g.data || !Array.isArray((g.data as GuestList).wishes)) { forgetGuestList(token); return setState("invalid"); }
    let rows: Mine[] = [];
    const codes = getCodes();
    if (session) {
      // Angemeldet: Liste im Konto speichern, Reservierungen vom Gerät übernehmen, eigene Reservierungen vom Konto
      await syncDeviceToAccount(session.user.id);
      await client.rpc("follow_list", { p_token: token });
      if (codes.length) await client.rpc("claim_reservations", { p_codes: codes });
      const a = await client.rpc("my_account_reservations", { p_token: token });
      if (!a.error) rows = ((a.data ?? []) as { id: string; wish_id: string; quantity: number; amount_cents: number | null }[])
        .map((r) => ({ code: "", id: r.id, wish_id: r.wish_id, quantity: r.quantity, amount_cents: r.amount_cents }));
    } else if (codes.length) {
      const m = await client.rpc("my_reservations", { p_codes: codes });
      if (!m.error) {
        rows = m.data as Mine[];
        keepCodes(new Set(rows.map((r) => r.code)));
      }
    }
    setList(g.data as GuestList);
    setMine(rows);
    setState("ok");
    remember(`guest:${token}`, { list: g.data as GuestList, mine: rows });
    const gl = g.data as GuestList;
    rememberGuestList({ token, title: gl.title, recipient_name: gl.recipient_name, event_date: gl.event_date, cover: gl.cover });
  }, [token, session]);
  const ptr = usePullToRefresh(() => load());

  // Angemeldet: Name fürs Reservieren aus dem Konto vorschlagen
  useEffect(() => { if (session && displayName && !getName()) setName(displayName); }, [session, displayName]);

  useAppStartUrl(token);

  useRefreshOnReturn(() => load());

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <SkeletonGuest />;
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
        <p className="mt-16"><button className="btn" onClick={() => { setState("loading"); load(); }}>Erneut versuchen</button></p>
      </div>
    );

  const ids = new Set(list.wishes.map((w) => w.id));
  const myHere = mine.filter((m) => ids.has(m.wish_id));
  const mineOf = (w: GuestWish) => myHere.filter((m) => m.wish_id === w.id);
  const howtoKey = KEYS.howto(token);
  const firstVisit = myHere.length === 0 && !hasFlag(howtoKey);
  const markHowtoSeen = () => setFlag(howtoKey);
  const myWishes = list.wishes.filter((w) => mineOf(w).length);
  const open = list.wishes.filter((w) => w.available > 0 && inPrice(w, price));
  const taken = list.wishes.filter((w) => w.available <= 0 && !mineOf(w).length);
  const c = cover(list.cover);
  const meta = [list.recipient_name ? `Für ${list.recipient_name}` : "", list.event_date ? `${OCCASIONS[list.occasion]} am ${dateLabel(list.event_date)}` : ""].filter(Boolean).join(", ");

  const reserve = async (wish: GuestWish, qty: number, name: string, parentsBuy: boolean) => {
    setBusy(true);
    const { data, error } = await db().rpc("reserve_wish", { p_token: token, p_wish: wish.id, p_quantity: qty, p_name: name, p_parents_buy: parentsBuy });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    const r = data as { ok: boolean; code?: string; error?: string; available?: number };
    if (r.ok && r.code) {
      addCode(r.code);
      markHowtoSeen();
      setName(name);
      setSheet({ kind: "done", wish, parentsBuy });
      celebrate("small");
    } else if (r.error === "already_taken") setSheet({ kind: "taken", available: r.available ?? 0 });
    else if (r.error === "name_required") return toast("Bitte gib deinen Namen an.");
    else if (r.error === "rate_limited") return toast("Gerade wurde auf dieser Liste sehr viel reserviert. Bitte versuch es in einer Minute noch einmal.");
    else setState("invalid");
    load();
  };

  const contribute = async (wish: GuestWish, amount: number, name: string) => {
    setBusy(true);
    const { data, error } = await db().rpc("contribute", { p_token: token, p_wish: wish.id, p_amount_cents: amount, p_name: name });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    const r = data as { ok: boolean; code?: string; error?: string; open_cents?: number };
    if (r.ok && r.code) {
      addCode(r.code);
      markHowtoSeen();
      setName(name);
      const complete = (r.open_cents ?? 1) === 0;
      setSheet({ kind: "contributed", wish, amount, complete });
      celebrate(complete ? "big" : "small");
    } else if (r.error === "too_much") setSheet({ kind: "giftInfo", text: `Inzwischen fehlen nur noch ${euroShort(r.open_cents ?? 0)}. Du kannst gern diesen Rest übernehmen.` });
    else if (r.error === "fully_funded") setSheet({ kind: "giftInfo", text: "Gerade ist der letzte Betrag zusammengekommen. Das Geschenk ist komplett, danke trotzdem!" });
    else if (r.error === "too_little") return toast(`Bitte mindestens ${euroShort(Math.min(500, r.open_cents ?? 500))}.`);
    else if (r.error === "rate_limited") return toast("Gerade ist hier sehr viel los. Bitte versuch es in einer Minute noch einmal.");
    else if (r.error === "name_required") return toast("Bitte gib deinen Namen an.");
    else setState("invalid");
    load();
  };

  const cancel = async (m: { code: string; id?: string }) => {
    setBusy(true);
    // Am Konto: ohne Code aufheben; sonst mit dem Code dieses Geräts
    const { data, error } = m.id && !m.code
      ? await db().rpc("cancel_my_reservation", { p_id: m.id })
      : await db().rpc("cancel_reservation", { p_code: m.code });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    if ((data as { error?: string } | null)?.error === "rate_limited") return toast("Zu viele Versuche. Bitte warte ein paar Minuten.");
    if (m.code) removeCode(m.code);
    close();
    toast("Reservierung aufgehoben.");
    load();
  };

  const card = (w: GuestWish, mode: "open" | "mine" | "taken") => {
    const my = mineOf(w);
    const myQty = my.reduce((a, m) => a + m.quantity, 0);
    const myAmount = my.reduce((a, m) => a + (m.amount_cents ?? 0), 0);
    const group = !!w.group_gift && w.target_cents != null;
    const funded = w.funded_cents ?? 0;
    const target = w.target_cents ?? 0;
    if (mode === "taken") {
      return (
        <article className="gcard compact taken" key={`taken-${w.id}`}>
          <WishTile wish={w} wrapped />
          <div className="body">
            <h3>{w.title}</h3>
            {w.price_cents != null && <p className="note">{formatPrice(w.price_cents)}</p>}
            <p className="taken-tag">{group ? "Komplett zusammen" : "Schon vergeben"}</p>
          </div>
        </article>
      );
    }
    const tiles = view === "grid";
    return (
      <article className={`gcard ${tiles ? "" : "row"}`} key={`${mode}-${w.id}`}>
        <button type="button" className="gcard-open" onClick={() => setSheet({ kind: "details", wish: w, mode })} aria-label={`${w.title}: alle Details`}>
          <WishTile wish={w} wrapped={mode === "mine"} />
          <span className="body">
            <span className="badge-row"><PriorityBadge priority={w.priority} />{group && <span className="badge group-badge">Gemeinsam</span>}</span>
            <span className="gtitle">{w.title}</span>
            {w.note && <span className="note">{w.note}</span>}
            {w.price_cents != null && <span className="price">{formatPrice(w.price_cents)}</span>}
            {group && (
              <span className="gift-box">
                <span className="gift-sum"><span><b>{euroShort(funded)}</b> von {euroShort(target)}</span>{!tiles && (w.contributors ?? 0) > 0 && <small>{w.contributors} {w.contributors === 1 ? "Person macht" : "Personen machen"} mit</small>}</span>
                <span className="progress" aria-hidden="true"><span style={{ width: `${target ? Math.min(100, Math.round((funded / target) * 100)) : 0}%` }} /></span>
              </span>
            )}
            {mode === "open" && !group && w.quantity > 1 && <span className="note avail">Noch {w.available} von {w.quantity} frei</span>}
            {mode === "mine" && <span className="mine-tag"><IconCheck /> {myAmount > 0 ? `Du steuerst ${euroShort(myAmount)} bei` : `Von dir reserviert${myQty > 1 ? ` (${myQty} Stück)` : ""}`}</span>}
          </span>
        </button>
        {w.url && (
          <a className="gshop" href={w.url} target="_blank" rel="noopener noreferrer" aria-label={`„${w.title}“ ${w.shop ? `bei ${w.shop}` : "im Shop"} ansehen`}>
            <IconExt />
          </a>
        )}
        <div className="actions">{actionsFor(w, mode, my, funded, tiles ? "tile" : "row")}</div>
      </article>
    );
  };

  /** Knöpfe eines Wunsches, gleich in Karte und Detailansicht */
  const actionsFor = (w: GuestWish, mode: "open" | "mine", my: Mine[], funded: number, where: "tile" | "row" | "detail" = "detail") => {
    const group = !!w.group_gift && w.target_cents != null;
    return (
      <>
        {mode === "open" && !group && <button className="btn ribbon big" onClick={() => setSheet({ kind: "reserve", wish: w })}><IconGift /> Reservieren</button>}
        {mode === "open" && group && <button className="btn ribbon big" onClick={() => setSheet({ kind: "contribute", wish: w, full: false })}><IconGift /> Mitschenken</button>}
        {mode === "open" && group && funded === 0 && where !== "tile" && <button className="btn quiet" onClick={() => setSheet({ kind: "contribute", wish: w, full: true })}>Ich schenke es ganz</button>}
        {mode === "mine" && my.map((m) => (
          <button key={m.code || m.id} className="btn quiet" onClick={() => setSheet({ kind: "cancel", wish: w, code: m.code, id: m.id })}>{m.amount_cents != null ? "Beitrag zurückziehen" : "Reservierung aufheben"}</button>
        ))}
      </>
    );
  };

  const chip = (v: Price, t: string) => (
    <button className="fchip" aria-pressed={price === v} onClick={() => setPrice(v)}>{t}</button>
  );

  return (
    <div className="wrap">
      <PullIndicator {...ptr} />
      {session && (
        <div className="preview">
          <span><b>Vorschau:</b> So sehen Gäste diese Liste. Namen von Schenkenden sind hier nie sichtbar.</span>
          <Link className="btn small soft" to={`/liste/${list.id}`}>Zur Verwaltung</Link>
        </div>
      )}
      <section className="guest-head">
        <span className={`hero-cover t${c.t}`} aria-hidden="true">{c.e}</span>
        <div>
          <p className="eyebrow">Wunschliste</p>
          <h1>{list.title}</h1>
          {meta && <p className="lead">{meta}</p>}
        </div>
      </section>
      {list.description && <p className="hero-desc">{list.description}</p>}
      {firstVisit ? (
        <p className="howto-text">Such dir ein Geschenk aus und tippe auf <b>Reservieren</b>. Dann sehen alle anderen, dass es vergeben ist. Ein Konto brauchst du nicht.</p>
      ) : (
        <details className="howto-mini">
          <summary>So funktioniert’s</summary>
          <p>Such dir ein Geschenk aus und tippe auf <b>Reservieren</b>. Dann sehen alle anderen, dass es vergeben ist. Ein Konto brauchst du nicht. Tippe auf einen Wunsch für alle Details.</p>
        </details>
      )}

      {/* Wie in der Verwaltung: Überschrift links, Umschalter Liste/Kacheln rechts */}
      <div className="wl-bar">
        <h2 className="section-title">{myWishes.length > 0 ? "Deine Geschenke" : "Wünsche"}</h2>
        <div className="view-toggle" role="group" aria-label="Ansicht der Wünsche">
          <button type="button" aria-pressed={view === "rows"} onClick={() => chooseView("rows")}><IconRows /> Liste</button>
          <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}><IconGrid /> Kacheln</button>
        </div>
      </div>

      {myWishes.length > 0 && (
        <>
          <div className={`ggrid ${view === "grid" ? "tiles" : "rows"}`} role="region" aria-label="Deine Geschenke">{myWishes.map((w) => card(w, "mine"))}</div>
          <h2 className="section-title" style={{ margin: "26px 2px 12px" }}>Noch zu vergeben</h2>
        </>
      )}

      <div className="filters scroll-x guest-filters" role="group" aria-label="Nach Preis filtern">
        {chip("all", "Alle")}{chip("20", "bis 20 €")}{chip("50", "bis 50 €")}{chip("more", "über 50 €")}
      </div>

      <div className={`ggrid ${view === "grid" ? "tiles" : "rows"}`}>
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
          <div className="ggrid mt-12">{taken.map((w) => card(w, "taken"))}</div>
        </details>
      )}

      <p className="hint mt-34 ta-center">
        Auf einem anderen Gerät reserviert oder umentschieden? Sag einfach der Familie Bescheid, dann wird die Reservierung freigegeben.
      </p>

      <GuestFooter token={token} signedIn={!!session} />

      <Sheet open={sheet?.kind === "reserve"} onClose={close} label="Wunsch reservieren">
        {sheet?.kind === "reserve" && <ReserveForm wish={sheet.wish} allowParentsBuy={!!list?.allow_parents_buy} busy={busy} onSubmit={(q, n, pb) => reserve(sheet.wish, q, n, pb)} />}
      </Sheet>

      <Sheet open={sheet?.kind === "details"} onClose={close} label="Wunsch im Detail">
        {sheet?.kind === "details" && (() => {
          const w = list?.wishes.find((x) => x.id === sheet.wish.id) ?? sheet.wish;
          const my = mineOf(w);
          const mode = my.length ? "mine" : sheet.mode;
          const group = !!w.group_gift && w.target_cents != null;
          const funded = w.funded_cents ?? 0, target = w.target_cents ?? 0, open = Math.max(0, target - funded);
          const myAmount = my.reduce((a, m) => a + (m.amount_cents ?? 0), 0);
          const myQty = my.reduce((a, m) => a + m.quantity, 0);
          return (
            <div className="gdetail">
              <WishTile wish={w} wrapped={mode === "mine"} />
              <span className="badge-row"><PriorityBadge priority={w.priority} />{group && <span className="badge group-badge">Gemeinsam schenken</span>}</span>
              <h2>{w.title}</h2>
              {w.price_cents != null && <p className="price">{formatPrice(w.price_cents)}{w.quantity > 1 && !group ? ` pro Stück` : ""}</p>}
              {w.note && <p className="gdetail-note">{w.note}</p>}
              {group && (
                <div className="gift-box">
                  <div className="gift-sum"><span><b>{euroShort(funded)}</b> von {euroShort(target)}</span>{(w.contributors ?? 0) > 0 && <small>{w.contributors} {w.contributors === 1 ? "Person macht" : "Personen machen"} mit</small>}</div>
                  <span className="progress big" aria-hidden="true"><span style={{ width: `${target ? Math.min(100, Math.round((funded / target) * 100)) : 0}%` }} /></span>
                  {mode === "open" && <small className="note">Es fehlen noch <b>{euroShort(open)}</b>. Die Eltern kaufen das Geschenk, sobald alles zusammen ist.</small>}
                </div>
              )}
              {mode === "open" && !group && w.quantity > 1 && <p className="note">Noch {w.available} von {w.quantity} frei</p>}
              {mode === "mine" && <p className="mine-tag"><IconCheck /> {myAmount > 0 ? `Du steuerst ${euroShort(myAmount)} bei` : `Von dir reserviert${myQty > 1 ? ` (${myQty} Stück)` : ""}`}</p>}
              {w.url && (
                <a className="btn soft block" href={w.url} target="_blank" rel="noopener noreferrer"><IconExt /> {w.shop ? `Bei ${w.shop} ansehen` : "Im Shop ansehen"}</a>
              )}
              <div className="gdetail-actions">{actionsFor(w, mode, my, funded)}</div>
            </div>
          );
        })()}
      </Sheet>

      <Sheet open={sheet?.kind === "contribute"} onClose={close} label="Mitschenken">
        {sheet?.kind === "contribute" && (
          <ContributeForm wish={sheet.wish} full={sheet.full} busy={busy} onSubmit={(a, n) => contribute(sheet.wish, a, n)} />
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "contributed"} onClose={close} label="Beitrag bestätigt">
        {sheet?.kind === "contributed" && (
          <>
            <h2>{sheet.complete ? "Geschafft! Das Geschenk ist komplett." : "Danke!"}</h2>
            <p>Du steuerst <b>{euroShort(sheet.amount)}</b> zu „{sheet.wish.title}“ bei.{sheet.complete ? " Damit ist alles zusammen." : ""}</p>
            <p className="notice mt-12">Die Eltern kaufen das Geschenk, sobald alles zusammen ist. Deinen Betrag gibst du ihnen direkt.</p>
            <p className="hint mt-12">Dieses Gerät merkt sich deinen Beitrag. Hier kannst du ihn jederzeit zurückziehen.</p>
            <button className="btn block mt-14" onClick={close}>Fertig</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "giftInfo"} onClose={close} label="Hinweis">
        {sheet?.kind === "giftInfo" && (
          <>
            <h2>Da hat sich etwas getan.</h2>
            <p>{sheet.text}</p>
            <button className="btn block mt-16" onClick={close}>Zur Liste</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "done"} onClose={close} label="Reservierung bestätigt">
        {sheet?.kind === "done" && (
          <>
            <h2>Reserviert!</h2>
            <WishTile wish={sheet.wish} wrapped animate className="confirm-tile" />
            <p>„{sheet.wish.title}“ ist jetzt für dich reserviert. Alle anderen sehen nur noch: vergeben.</p>
            {sheet.parentsBuy && <p className="notice mt-12">Die Eltern wissen Bescheid, dass sie das Geschenk für dich besorgen. Das Geld regelt ihr am besten direkt miteinander.</p>}
            {!sheet.parentsBuy && sheet.wish.url && (
              <p className="mt-14">
                <a className="btn line block" href={sheet.wish.url} target="_blank" rel="noopener noreferrer"><IconExt /> Zum Shop</a>
              </p>
            )}
            <p className="hint mt-12">
              Dieses Gerät merkt sich deine Reservierung. Hier kannst du sie jederzeit wieder aufheben. Von einem anderen Gerät aus sag einfach der Familie Bescheid.
            </p>
            <button className="btn block mt-14" onClick={close}>Fertig</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "taken"} onClose={close} label="Hinweis">
        {sheet?.kind === "taken" && (
          <>
            <h2>Da war jemand schneller.</h2>
            <p>{sheet.available > 0 ? `Es sind nur noch ${sheet.available} frei.` : "Dieser Wunsch ist gerade vergeben worden."} Schau dir gern die anderen Wünsche an.</p>
            <button className="btn block mt-16" onClick={close}>Zur Liste</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "cancel"} onClose={close} label="Reservierung aufheben">
        {sheet?.kind === "cancel" && (
          <>
            <h2>{sheet.wish.group_gift ? "Beitrag zurückziehen?" : "Reservierung aufheben?"}</h2>
            <p>{sheet.wish.group_gift ? `Dein Beitrag zu „${sheet.wish.title}“ wird entfernt.` : `„${sheet.wish.title}“ ist danach wieder für alle frei.`}</p>
            <div className="toolbar mt-18">
              <button className="btn danger" disabled={busy} onClick={() => cancel(sheet)}>Ja, aufheben</button>
              <button className="btn soft" onClick={close}>Behalten</button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
