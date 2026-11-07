import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, cover, sortWishes, type Reservation, type Wish, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, friendlyError, toast } from "../lib/format";
import { removeImage } from "../lib/wishes";
import { IconBack, IconEdit, IconExt, IconEye, IconPlus, IconShare, IconTrash, IconUndo, IconUsers } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { WishForm } from "../components/WishForm";
import { WishRow } from "../components/WishRow";
import { ShareContent } from "../components/ShareSheet";

type SheetState =
  | null
  | { kind: "editList" }
  | { kind: "deleteList" }
  | { kind: "addWish" }
  | { kind: "editWish"; wish: Wish }
  | { kind: "deleteWish"; wish: Wish }
  | { kind: "share" }
  | { kind: "release"; wish: Wish; reservation: Reservation };

export function ListPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<WishList | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);
  const close = () => setSheet(null);

  const load = useCallback(async () => {
    const [l, w] = await Promise.all([
      db().from("lists").select(LIST_SELECT).eq("id", id).maybeSingle(),
      db().from("wishes").select("*").eq("list_id", id),
    ]);
    if (l.error || w.error) return setState("error");
    if (!l.data) return setState("missing");
    const ws = w.data as Wish[];
    // Reservierungen liefert die Datenbank nur, wenn der eigene Schalter „anzeigen“ an ist.
    let rs: Reservation[] = [];
    if (ws.length) {
      const r = await db().from("reservations").select("id,wish_id,quantity,guest_name,created_at").in("wish_id", ws.map((x) => x.id));
      if (!r.error && Array.isArray(r.data)) rs = r.data as Reservation[];
    }
    setList(l.data as WishList);
    setWishes(sortWishes(ws));
    setReservations(rs);
    setState("ok");
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <p className="loading">Liste wird geladen …</p>;
  if (state !== "ok" || !list)
    return (
      <div className="wrap narrow">
        <h1>{state === "missing" ? "Diese Liste gibt es nicht oder du hast keinen Zugriff." : "Die Liste konnte nicht geladen werden."}</h1>
        <p style={{ marginTop: 16 }}><Link className="btn soft" to="/">Zu meinen Listen</Link></p>
      </div>
    );

  const me = list.list_members?.find((m) => m.user_id === session?.user.id);
  const isOwner = me?.role === "owner";
  const showRes = me?.show_reservations ?? true;
  const resOf = (w: Wish) => reservations.filter((r) => r.wish_id === w.id);
  const totalQty = wishes.reduce((a, w) => a + w.quantity, 0);
  const takenQty = wishes.reduce((a, w) => a + Math.min(w.quantity, resOf(w).reduce((s, r) => s + r.quantity, 0)), 0);
  const pct = totalQty ? Math.round((takenQty / totalQty) * 100) : 0;
  const c = cover(list.cover);
  const cd = countdownLabel(list.event_date);
  const meta = [list.recipient_name ? `Für ${list.recipient_name}` : "", dateLabel(list.event_date), cd ?? ""].filter(Boolean).join(", ");

  const toggleShow = async (on: boolean) => {
    const { error } = await db().rpc("set_show_reservations", { p_list: list.id, p_show: on });
    if (error) return toast(friendlyError(error));
    load();
  };

  const saveList = async (v: ListInput) => {
    setBusy(true);
    const { error } = await db().from("lists").update(toRow(v)).eq("id", list.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    close();
    toast("Gespeichert.");
    load();
  };

  const deleteList = async () => {
    setBusy(true);
    const paths = wishes.map((w) => w.image_path).filter((p): p is string => !!p && !/^https?:/.test(p));
    const { error } = await db().from("lists").delete().eq("id", list.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    if (paths.length) await db().storage.from("wish-images").remove(paths);
    close();
    toast("Liste gelöscht.");
    navigate("/");
  };

  const deleteWish = async (w: Wish) => {
    setBusy(true);
    const { error } = await db().from("wishes").delete().eq("id", w.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    await removeImage(w.image_path);
    close();
    toast("Wunsch gelöscht.");
    load();
  };

  const release = async (r: Reservation) => {
    setBusy(true);
    const { error } = await db().from("reservations").delete().eq("id", r.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    close();
    toast("Reservierung freigegeben.");
    load();
  };

  const saved = () => {
    close();
    load();
  };

  return (
    <>
      <header className="page-bar">
        <div className="page-bar-in">
          <Link className="bar-back" to="/"><IconBack /> Listen</Link>
          <button className="bar-action" onClick={() => setSheet({ kind: "editList" })}><IconEdit /> Bearbeiten</button>
        </div>
      </header>

      <div className="wrap with-bottom-bar">
        <section className="hero-row">
          <span className={`hero-cover t${c.t}`} aria-hidden="true">{c.e}</span>
          <div>
            <h1>{list.title}</h1>
            {meta && <p className="lead">{meta}</p>}
          </div>
        </section>
        {list.description && <p className="hero-desc">{list.description}</p>}

        <nav className="action-grid" aria-label="Aktionen für diese Liste">
          <button className="action-tile" onClick={() => setSheet({ kind: "share" })}><IconShare /> Teilen</button>
          <Link className="action-tile" to={`/w/${list.guest_token}`}><IconEye /> Gästeansicht</Link>
          <Link className="action-tile" to={`/liste/${list.id}/mitglieder`}><IconUsers /> Mitglieder</Link>
        </nav>

        {wishes.length > 0 && (
          <section className="status-card" aria-label="Stand der Reservierungen">
            <div className="status-top">
              <b>{showRes ? `${takenQty} von ${totalQty} ${totalQty === 1 ? "Wunsch" : "Wünschen"} vergeben` : "Reservierungen ausgeblendet"}</b>
              <label className="mini-switch">
                <span>Anzeigen</span>
                <input type="checkbox" role="switch" checked={showRes} onChange={(e) => toggleShow(e.target.checked)} aria-label="Reservierungen anzeigen" />
              </label>
            </div>
            {showRes ? (
              <span className="progress big" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
            ) : (
              <span className="hint">Praktisch, wenn die Liste für dich selbst ist. Gilt nur für dich.</span>
            )}
          </section>
        )}

        <h2 className="section-title">Wünsche</h2>
        <div className="wlist">
          {wishes.length === 0 ? (
            <div className="empty">
              <p>Noch keine Wünsche. Tippe unten auf „Wunsch hinzufügen“ und such direkt nach einem Produkt.</p>
            </div>
          ) : (
            wishes.map((w) => (
              <WishRow key={w.id} wish={w} reservations={resOf(w)} showReservations={showRes} onOpen={() => setSheet({ kind: "editWish", wish: w })} />
            ))
          )}
        </div>
      </div>

      <div className="bottom-bar">
        <button className="btn block big" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Wunsch hinzufügen</button>
      </div>

      {/* Formulare als eigene Seite mit fester Leiste */}
      <FormSheet open={sheet?.kind === "editList"} onClose={close} title="Liste" formId="edit-list" busy={busy}>
        {sheet?.kind === "editList" && (
          <>
            <ListForm formId="edit-list" list={list} onSubmit={saveList} />
            {isOwner && (
              <div className="danger-zone">
                <button type="button" className="btn danger block" onClick={() => setSheet({ kind: "deleteList" })}><IconTrash /> Liste löschen</button>
              </div>
            )}
          </>
        )}
      </FormSheet>

      <FormSheet open={sheet?.kind === "addWish"} onClose={close} title="Neuer Wunsch" formId="add-wish" busy={wishBusy}>
        {sheet?.kind === "addWish" && <WishForm formId="add-wish" listId={list.id} onSaved={saved} onBusyChange={setWishBusy} />}
      </FormSheet>

      <FormSheet open={sheet?.kind === "editWish"} onClose={close} title="Bearbeiten" formId="edit-wish" busy={wishBusy}>
        {sheet?.kind === "editWish" && (
          <>
            <WishForm formId="edit-wish" listId={list.id} wish={sheet.wish} onSaved={saved} onBusyChange={setWishBusy} />
            <div className="menu form-extra">
              {sheet.wish.url && <a href={sheet.wish.url} target="_blank" rel="noopener noreferrer"><IconExt /> Im Shop öffnen</a>}
              {showRes && resOf(sheet.wish).map((r) => (
                <button type="button" key={r.id} onClick={() => setSheet({ kind: "release", wish: sheet.wish, reservation: r })}>
                  <IconUndo /> Reservierung von {r.guest_name} freigeben
                </button>
              ))}
              <button type="button" className="danger" onClick={() => setSheet({ kind: "deleteWish", wish: sheet.wish })}><IconTrash /> Wunsch löschen</button>
            </div>
          </>
        )}
      </FormSheet>

      {/* Kurze Rückfragen als kleine Dialoge */}
      <Sheet open={sheet?.kind === "share"} onClose={close} label="Liste teilen">
        {sheet?.kind === "share" && <ShareContent list={list} onNavigate={close} />}
      </Sheet>

      <Sheet open={sheet?.kind === "deleteList"} onClose={close} label="Liste löschen">
        <h2>„{list.title}“ löschen?</h2>
        <p>Alle Wünsche und Reservierungen dieser Liste werden gelöscht, und der Gast-Link funktioniert nicht mehr. Das lässt sich nicht rückgängig machen.</p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <button className="btn danger" onClick={deleteList} disabled={busy}>Endgültig löschen</button>
          <button className="btn soft" onClick={close}>Abbrechen</button>
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "deleteWish"} onClose={close} label="Wunsch löschen">
        {sheet?.kind === "deleteWish" && (
          <>
            <h2>„{sheet.wish.title}“ löschen?</h2>
            <p>Falls schon jemand diesen Wunsch reserviert hat, verliert die Person ihre Reservierung.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn danger" onClick={() => deleteWish(sheet.wish)} disabled={busy}>Löschen</button>
              <button className="btn soft" onClick={close}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "release"} onClose={close} label="Reservierung freigeben">
        {sheet?.kind === "release" && (
          <>
            <h2>Reservierung freigeben?</h2>
            <p>„{sheet.wish.title}“ ist danach wieder für alle frei. Sprich dich am besten vorher mit {sheet.reservation.guest_name} ab, damit nichts doppelt gekauft wird.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn" disabled={busy} onClick={() => release(sheet.reservation)}>Freigeben</button>
              <button className="btn soft" onClick={close}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
