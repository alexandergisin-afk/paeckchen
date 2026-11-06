import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, OCCASIONS, cover, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, friendlyError, toast } from "../lib/format";
import { IconBack, IconEdit, IconTrash } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";

export function ListPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<WishList | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [sheet, setSheet] = useState<null | "edit" | "delete">(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db().from("lists").select(LIST_SELECT).eq("id", id).maybeSingle();
    if (error) return setState("error");
    if (!data) return setState("missing");
    setList(data as WishList);
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

  const save = async (v: ListInput) => {
    setBusy(true);
    const { error } = await db().from("lists").update(toRow(v)).eq("id", list.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setSheet(null);
    toast("Gespeichert.");
    load();
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await db().from("lists").delete().eq("id", list.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setSheet(null);
    toast("Liste gelöscht.");
    navigate("/");
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
        <button className="btn soft" onClick={() => setSheet("edit")}><IconEdit /> Bearbeiten</button>
        {isOwner && <button className="btn danger" onClick={() => setSheet("delete")}><IconTrash /> Löschen</button>}
      </div>

      <div className="notice">
        <b>Bald hier:</b> Wünsche hinzufügen, teilen und reservieren lassen. Das bauen wir in Etappe 2.
      </div>

      <Sheet open={sheet === "edit"} onClose={() => setSheet(null)} label="Liste bearbeiten">
        <h2>Liste bearbeiten</h2>
        <ListForm list={list} busy={busy} onSubmit={save} />
      </Sheet>
      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} label="Liste löschen">
        <h2>„{list.title}“ löschen?</h2>
        <p>Alle Wünsche und Reservierungen dieser Liste werden gelöscht, und der Gast-Link funktioniert nicht mehr. Das lässt sich nicht rückgängig machen.</p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <button className="btn danger" onClick={remove} disabled={busy}>Endgültig löschen</button>
          <button className="btn soft" onClick={() => setSheet(null)}>Abbrechen</button>
        </div>
      </Sheet>
    </div>
  );
}
