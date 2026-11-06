import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, OCCASIONS, cover, sortWishes, type Reservation, type Wish, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, friendlyError, toast } from "../lib/format";
import { removeImage } from "../lib/wishes";
import { IconBack, IconEdit, IconExt, IconMore, IconPlus, IconShare, IconTrash, IconUndo } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { WishForm } from "../components/WishForm";
import { WishRow } from "../components/WishRow";
import { ShareContent } from "../components/ShareSheet";

type SheetState =
  | null
  | { kind: "listMenu" }
  | { kind: "editList" }
  | { kind: "deleteList" }
  | { kind: "addWish" }
  | { kind: "wishMenu"; wish: Wish }
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
      if (!r.error) rs = r.data as Reservation[];
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
  const reservedQty = reservations.reduce((a, r) => a + r.quantity, 0);

  const toggleShow = async (on: boolean) => {
    const { error } = await db().rpc("set_show_reservations", { p_list: list.id, p_show: on });
    if (error) return toast(friendlyError(error));
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
  const c = cover(list.cover);
  const cd = countdownLabel(list.event_date);

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

  const saved = () => {
    close();
    load();
  };

  return (
    <div className="wrap">
      <Link className="back" to="/"><IconBack /> Alle Listen</Link>
      <section className={`lhead t${c.t}`}>
        <div className="big"><span aria-hidden="true">{c.e}</span></div>
        <div>
          <h1>{list.title}</h1>
          <p>
            {[list.recipient_name ? `Für ${list.recipient_name}` : "", list.event_date ? `${OCCASIONS[list.occasion]} am ${dateLabel(list.event_date)}` : ""].filter(Boolean).join(", ")}{" "}
            {cd && <span className="badge">{cd}</span>}
          </p>
          {list.description && <p>{list.description}</p>}
        </div>
      </section>

      <div className="toolbar">
        <button className="btn" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Wunsch hinzufügen</button>
        <button className="btn soft" onClick={() => setSheet({ kind: "share" })}><IconShare /> Teilen</button>
        <button className="icon-btn" onClick={() => setSheet({ kind: "listMenu" })} aria-label="Weitere Aktionen"><IconMore /></button>
      </div>

      <div className="panel plan">
        <label className="switch">
          <input type="checkbox" checked={showRes} onChange={(e) => toggleShow(e.target.checked)} />
          <span>
            <b>Reservierungen anzeigen</b><br />
            <span className="hint">Zeigt dir, was schon vergeben ist und von wem. Schalte das aus, wenn die Liste für dich selbst ist. Die Einstellung gilt nur für dich.</span>
          </span>
        </label>
        {showRes && wishes.length > 0 && (
          <div className="plan-stats">
            <span className="badge">{Math.max(0, totalQty - reservedQty)} frei</span>
            <span className="badge st-res">{reservedQty} reserviert</span>
          </div>
        )}
      </div>

      <div className="wl-head"><h2>Wünsche <span className="meta">({wishes.length})</span></h2></div>
      <div className="wlist">
        {wishes.length === 0 ? (
          <div className="empty">
            <p>Noch keine Wünsche. Füge einen Shop-Link ein oder such direkt im Shop.</p>
            <button className="btn" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Ersten Wunsch hinzufügen</button>
          </div>
        ) : (
          wishes.map((w) => (
            <WishRow key={w.id} wish={w} reservations={resOf(w)} showReservations={showRes} onMenu={() => setSheet({ kind: "wishMenu", wish: w })} />
          ))
        )}
      </div>


      <Sheet open={sheet?.kind === "listMenu"} onClose={close} label="Listenaktionen">
        <h2>{list.title}</h2>
        <div className="menu">
          <button onClick={() => setSheet({ kind: "editList" })}><IconEdit /> Name, Anlass und Bild ändern</button>
          {isOwner && <button className="danger" onClick={() => setSheet({ kind: "deleteList" })}><IconTrash /> Liste löschen</button>}
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "editList"} onClose={close} label="Liste bearbeiten">
        <h2>Liste bearbeiten</h2>
        <ListForm list={list} busy={busy} onSubmit={saveList} />
      </Sheet>

      <Sheet open={sheet?.kind === "deleteList"} onClose={close} label="Liste löschen">
        <h2>„{list.title}“ löschen?</h2>
        <p>Alle Wünsche und Reservierungen dieser Liste werden gelöscht, und der Gast-Link funktioniert nicht mehr. Das lässt sich nicht rückgängig machen.</p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <button className="btn danger" onClick={deleteList} disabled={busy}>Endgültig löschen</button>
          <button className="btn soft" onClick={close}>Abbrechen</button>
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "addWish"} onClose={close} label="Wunsch hinzufügen">
        <h2>Wunsch hinzufügen</h2>
        {sheet?.kind === "addWish" && <WishForm listId={list.id} onSaved={saved} />}
      </Sheet>

      <Sheet open={sheet?.kind === "editWish"} onClose={close} label="Wunsch bearbeiten">
        <h2>Wunsch bearbeiten</h2>
        {sheet?.kind === "editWish" && <WishForm listId={list.id} wish={sheet.wish} onSaved={saved} />}
      </Sheet>

      <Sheet open={sheet?.kind === "wishMenu"} onClose={close} label="Wunschaktionen">
        {sheet?.kind === "wishMenu" && (
          <>
            <h2>{sheet.wish.title}</h2>
            <div className="menu">
              <button onClick={() => setSheet({ kind: "editWish", wish: sheet.wish })}><IconEdit /> Bearbeiten</button>
              {sheet.wish.url && <a href={sheet.wish.url} target="_blank" rel="noopener noreferrer"><IconExt /> Im Shop öffnen</a>}
              {showRes && resOf(sheet.wish).map((r) => (
                <button key={r.id} onClick={() => setSheet({ kind: "release", wish: sheet.wish, reservation: r })}><IconUndo /> Reservierung von {r.guest_name} freigeben</button>
              ))}
              <button className="danger" onClick={() => setSheet({ kind: "deleteWish", wish: sheet.wish })}><IconTrash /> Löschen</button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "share"} onClose={close} label="Liste teilen">
        {sheet?.kind === "share" && <ShareContent list={list} onNavigate={close} />}
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
    </div>
  );
}
