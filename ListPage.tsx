import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, OCCASIONS, cover, sortWishes, type Wish, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, friendlyError, toast } from "../lib/format";
import { removeImage } from "../lib/wishes";
import { IconBack, IconEdit, IconExt, IconMore, IconPlus, IconTrash } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { WishForm } from "../components/WishForm";
import { WishRow } from "../components/WishRow";

type SheetState =
  | null
  | { kind: "listMenu" }
  | { kind: "editList" }
  | { kind: "deleteList" }
  | { kind: "addWish" }
  | { kind: "wishMenu"; wish: Wish }
  | { kind: "editWish"; wish: Wish }
  | { kind: "deleteWish"; wish: Wish };

export function ListPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<WishList | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
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
    setList(l.data as WishList);
    setWishes(sortWishes(w.data as Wish[]));
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

  const isOwner = list.list_members?.some((m) => m.user_id === session?.user.id && m.role === "owner");
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
        <button className="icon-btn" onClick={() => setSheet({ kind: "listMenu" })} aria-label="Weitere Aktionen"><IconMore /></button>
      </div>

      <div className="wl-head"><h2>Wünsche <span className="meta">({wishes.length})</span></h2></div>
      <div className="wlist">
        {wishes.length === 0 ? (
          <div className="empty">
            <p>Noch keine Wünsche. Füge einen Shop-Link ein oder such direkt im Shop.</p>
            <button className="btn" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Ersten Wunsch hinzufügen</button>
          </div>
        ) : (
          wishes.map((w) => <WishRow key={w.id} wish={w} onMenu={() => setSheet({ kind: "wishMenu", wish: w })} />)
        )}
      </div>

      <div className="notice" style={{ marginTop: 22 }}>
        <b>Als Nächstes:</b> Teilen und Reservieren kommen in Etappe 2b.
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
              <button className="danger" onClick={() => setSheet({ kind: "deleteWish", wish: sheet.wish })}><IconTrash /> Löschen</button>
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
