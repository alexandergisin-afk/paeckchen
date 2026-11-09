import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_PAGE_SELECT, cover, sortWishes, type Reservation, type Wish, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, daysUntil, friendlyError, toast } from "../lib/format";
import { parsePrice, removeImage } from "../lib/wishes";
import { copyWishes, moveWish } from "../lib/listOps";
import { euroShort, giftFunded, giftTarget, isGroupGift, takenQuantity } from "../lib/gift";
import { IconArchive, IconBack, IconChevron, IconCopy, IconGift, IconEdit, IconExt, IconEye, IconGrid, IconMove, IconPlus, IconRepeat, IconRows, IconShare, IconTrash, IconUndo, IconUsers } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { WishForm } from "../components/WishForm";
import { AddWishFlow } from "../components/AddWishFlow";
import { WishCard, WishRow } from "../components/WishRow";
import { ShareContent } from "../components/ShareSheet";

type SheetState =
  | null
  | { kind: "editList" }
  | { kind: "deleteList" }
  | { kind: "addWish"; url?: string }
  | { kind: "editWish"; wish: Wish }
  | { kind: "deleteWish"; wish: Wish }
  | { kind: "share" }
  | { kind: "release"; wish: Wish; reservation: Reservation }
  | { kind: "transfer"; wish: Wish; mode: "move" | "copy"; targets: { id: string; title: string; cover: number }[] | null }
  | { kind: "reuse" }
  | { kind: "reserveFor"; wish: Wish }
  | { kind: "contributeFor"; wish: Wish }
  | { kind: "archive" };

export function ListPage() {
  const { id } = useParams();
  const { session, displayName } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<WishList | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);
  const [view, setView] = useState<"rows" | "grid">(() => {
    try { return localStorage.getItem("paeckli-wish-view") === "grid" ? "grid" : "rows"; } catch { return "rows"; }
  });
  const chooseView = (v: "rows" | "grid") => {
    setView(v);
    try { localStorage.setItem("paeckli-wish-view", v); } catch { /* egal */ }
  };
  const close = () => setSheet(null);
  const [params, setParams] = useSearchParams();

  // Aus einer anderen App geteilt: direkt „Neuer Wunsch“ mit dem Link öffnen
  useEffect(() => {
    const shared = params.get("neu");
    if (!shared) return;
    setSheet({ kind: "addWish", url: shared });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    // Eine einzige Abfrage. Reservierungen liefert die Datenbank nur, wenn der eigene Schalter „anzeigen“ an ist.
    const { data, error } = await db().from("lists").select(LIST_PAGE_SELECT).eq("id", id).maybeSingle();
    if (error) return setState("error");
    if (!data) return setState("missing");
    const raw = data as unknown as Omit<WishList, "wishes"> & { wishes: (Wish & { reservations?: Reservation[] })[] };
    const ws: Wish[] = (raw.wishes ?? []).map(({ reservations: _r, ...w }) => w as Wish);
    const rs: Reservation[] = (raw.wishes ?? []).flatMap((w) => (Array.isArray(w.reservations) ? w.reservations : []));
    setList({ ...raw, wishes: undefined } as WishList);
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
  const takenQty = wishes.reduce((a, w) => a + takenQuantity(w, resOf(w)), 0);
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

  const openTransfer = async (wish: Wish, mode: "move" | "copy") => {
    if (mode === "move" && resOf(wish).length) return toast("Reservierte Wünsche bleiben in ihrer Liste. Du kannst den Wunsch kopieren.");
    setSheet({ kind: "transfer", wish, mode, targets: null });
    const { data, error } = await db().from("lists").select("id,title,cover").is("archived_at", null).neq("id", list.id).order("created_at", { ascending: false });
    if (error) return toast(friendlyError(error));
    setSheet({ kind: "transfer", wish, mode, targets: data as { id: string; title: string; cover: number }[] });
  };

  const transfer = async (wish: Wish, mode: "move" | "copy", target: { id: string; title: string }) => {
    setBusy(true);
    try {
      if (mode === "copy") await copyWishes([wish], target.id, session!.user.id);
      else await moveWish(wish, target.id);
      close();
      toast(mode === "copy" ? `In „${target.title}“ kopiert.` : `Nach „${target.title}“ verschoben.`);
      load();
    } catch (e) {
      toast(/has_reservations/.test((e as Error).message) ? "Der Wunsch ist inzwischen reserviert und bleibt deshalb hier. Du kannst ihn kopieren." : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (on: boolean) => {
    setBusy(true);
    const { error } = await db().from("lists").update({ archived_at: on ? new Date().toISOString() : null }).eq("id", list.id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    close();
    toast(on ? "Liste abgeschlossen. Der Gast-Link ist pausiert." : "Liste ist wieder aktiv.");
    load();
  };

  const reuse = async (form: { title: string; date: string; onlyFree: boolean; archiveOld: boolean }) => {
    setBusy(true);
    try {
      const { data, error } = await db().rpc("create_list", {
        p_title: form.title, p_recipient_name: list.recipient_name, p_occasion: list.occasion,
        p_event_date: form.date || null, p_cover: list.cover, p_description: list.description,
      });
      if (error) throw error;
      const newId = (data as { id: string }).id;
      const toCopy = wishes
        .map((w) => ({ ...w, copyQuantity: form.onlyFree ? w.quantity - takenQuantity(w, resOf(w)) : w.quantity }))
        .filter((w) => w.copyQuantity > 0);
      await copyWishes(toCopy, newId, session!.user.id);
      if (form.archiveOld) await db().from("lists").update({ archived_at: new Date().toISOString() }).eq("id", list.id);
      close();
      toast(`Neue Liste mit ${toCopy.length} ${toCopy.length === 1 ? "Wunsch" : "Wünschen"} angelegt.`);
      navigate(`/liste/${newId}`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const contributeFor = async (wish: Wish, name: string, amount: number) => {
    setBusy(true);
    const { data, error } = await db().rpc("contribute_for_guest", { p_wish: wish.id, p_amount_cents: amount, p_name: name });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    const r = data as { ok: boolean; error?: string; open_cents?: number };
    if (!r.ok) {
      const open = r.open_cents ?? 0;
      return toast(r.error === "too_much" ? `Es fehlen nur noch ${euroShort(open)}.` : r.error === "too_little" ? `Mindestens ${euroShort(Math.min(500, open))}.` : r.error === "fully_funded" ? "Es ist schon alles zusammen." : "Das hat nicht geklappt.");
    }
    close();
    toast(`${euroShort(amount)} von ${name} eingetragen.`);
    load();
  };

  const reserveFor = async (wish: Wish, name: string, qty: number, parentsBuy: boolean) => {
    setBusy(true);
    const { data, error } = await db().rpc("reserve_for_guest", { p_wish: wish.id, p_quantity: qty, p_name: name, p_parents_buy: parentsBuy });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    const r = data as { ok: boolean; error?: string; available?: number };
    if (!r.ok) {
      return toast(r.error === "already_taken" ? "Inzwischen hat jemand anderes reserviert." : r.error === "name_required" ? "Bitte gib einen Namen an." : "Das hat nicht geklappt.");
    }
    close();
    toast(`Für ${name} reserviert.`);
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

        {list.archived_at ? (
          <div className="notice-row">
            <span><b>Abgeschlossen.</b> Gäste können die Liste nicht mehr öffnen.</span>
            <button className="btn small" onClick={() => setArchived(false)} disabled={busy}>Wieder öffnen</button>
          </div>
        ) : (daysUntil(list.event_date) ?? 1) < 0 ? (
          <div className="notice-row">
            <span><b>Der Anlass ist vorbei.</b> Liste abschließen oder fürs nächste Mal wiederverwenden?</span>
            <span className="notice-actions">
              <button className="btn small soft" onClick={() => setSheet({ kind: "archive" })}>Abschließen</button>
              <button className="btn small" onClick={() => setSheet({ kind: "reuse" })}>Wiederverwenden</button>
            </span>
          </div>
        ) : null}

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

        <div className="wl-bar">
          <h2 className="section-title">Wünsche</h2>
          {wishes.length > 0 && (
            <div className="view-toggle" role="group" aria-label="Ansicht der Wünsche">
              <button type="button" aria-pressed={view === "rows"} onClick={() => chooseView("rows")}><IconRows /> Liste</button>
              <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}><IconGrid /> Kacheln</button>
            </div>
          )}
        </div>
        {wishes.length === 0 ? (
          <div className="empty">
            <p>Noch keine Wünsche. Tippe unten auf „Wunsch hinzufügen“ und such direkt nach einem Produkt.</p>
          </div>
        ) : view === "grid" ? (
          <div className="wgrid">
            {wishes.map((w) => (
              <WishCard key={w.id} wish={w} reservations={resOf(w)} showReservations={showRes} onOpen={() => setSheet({ kind: "editWish", wish: w })} />
            ))}
          </div>
        ) : (
          <div className="wlist">
            {wishes.map((w) => (
              <WishRow key={w.id} wish={w} reservations={resOf(w)} showReservations={showRes} onOpen={() => setSheet({ kind: "editWish", wish: w })} />
            ))}
          </div>
        )}
      </div>

      <div className="bottom-bar">
        <button className="btn block big" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Wunsch hinzufügen</button>
      </div>

      {/* Formulare als eigene Seite mit fester Leiste */}
      <FormSheet open={sheet?.kind === "editList"} onClose={close} title="Liste" formId="edit-list" busy={busy}>
        {sheet?.kind === "editList" && (
          <>
            <ListForm formId="edit-list" list={list} onSubmit={saveList} />
            <div className="menu form-extra">
              <button type="button" onClick={() => setSheet({ kind: "reuse" })}><IconRepeat /> Fürs nächste Mal wiederverwenden</button>
              {list.archived_at
                ? <button type="button" onClick={() => setArchived(false)}><IconArchive /> Wieder öffnen</button>
                : <button type="button" onClick={() => setSheet({ kind: "archive" })}><IconArchive /> Liste abschließen</button>}
              {isOwner && <button type="button" className="danger" onClick={() => setSheet({ kind: "deleteList" })}><IconTrash /> Liste löschen</button>}
            </div>
          </>
        )}
      </FormSheet>

      <AddWishFlow open={sheet?.kind === "addWish"} onClose={close} listId={list.id} recipient={list.recipient_name}
        initialUrl={sheet?.kind === "addWish" ? sheet.url : undefined} onSaved={saved} />

      <FormSheet open={sheet?.kind === "editWish"} onClose={close} title="Bearbeiten" formId="edit-wish" busy={wishBusy}>
        {sheet?.kind === "editWish" && (
          <>
            <WishForm formId="edit-wish" listId={list.id} wish={sheet.wish} recipient={list.recipient_name} onSaved={saved} onBusyChange={setWishBusy} />
            <div className="menu form-extra">
              {sheet.wish.url && <a href={sheet.wish.url} target="_blank" rel="noopener noreferrer"><IconExt /> Im Shop öffnen</a>}
              <button type="button" onClick={() => openTransfer(sheet.wish, "move")}><IconMove /> In andere Liste verschieben</button>
              <button type="button" onClick={() => openTransfer(sheet.wish, "copy")}><IconCopy /> In andere Liste kopieren</button>
              {showRes && !isGroupGift(sheet.wish) && sheet.wish.quantity - takenQuantity(sheet.wish, resOf(sheet.wish)) > 0 && (
                <button type="button" onClick={() => setSheet({ kind: "reserveFor", wish: sheet.wish })}><IconGift /> Für jemanden reservieren</button>
              )}
              {showRes && isGroupGift(sheet.wish) && (() => {
                const open = Math.max(0, giftTarget(sheet.wish) - giftFunded(resOf(sheet.wish)));
                return open > 0 ? (
                  <>
                    <button type="button" onClick={() => setSheet({ kind: "contributeFor", wish: sheet.wish })}><IconGift /> Beitrag für jemanden eintragen</button>
                    <button type="button" disabled={busy} onClick={() => contributeFor(sheet.wish, firstNameOf(displayName) || "Wir", open)}><IconGift /> Rest selbst übernehmen ({euroShort(open)})</button>
                  </>
                ) : null;
              })()}
              {showRes && resOf(sheet.wish).map((r) => (
                <button type="button" key={r.id} onClick={() => setSheet({ kind: "release", wish: sheet.wish, reservation: r })}>
                  <IconUndo /> {r.amount_cents != null ? `Beitrag von ${r.guest_name} (${euroShort(r.amount_cents)}) freigeben` : `Reservierung von ${r.guest_name} freigeben`}
                </button>
              ))}
              <button type="button" className="danger" onClick={() => setSheet({ kind: "deleteWish", wish: sheet.wish })}><IconTrash /> Wunsch löschen</button>
            </div>
          </>
        )}
      </FormSheet>

      <FormSheet open={sheet?.kind === "reuse"} onClose={close} title="Wiederverwenden" formId="reuse-list" submitLabel="Anlegen" busy={busy}>
        {sheet?.kind === "reuse" && <ReuseForm list={list} showRes={showRes} onSubmit={reuse} />}
      </FormSheet>

      {/* Kurze Rückfragen als kleine Dialoge */}
      <Sheet open={sheet?.kind === "transfer"} onClose={close} label="Ziel-Liste wählen">
        {sheet?.kind === "transfer" && (
          <>
            <h2>{sheet.mode === "move" ? "Verschieben nach …" : "Kopieren nach …"}</h2>
            <p className="hint">„{sheet.wish.title}“</p>
            {!sheet.targets ? <p className="loading" style={{ minHeight: 80 }}>Listen werden geladen …</p> : sheet.targets.length === 0 ? (
              <p style={{ marginTop: 12 }}>Du hast keine andere aktive Liste.</p>
            ) : (
              <div className="menu">
                {sheet.targets.map((t) => (
                  <button key={t.id} disabled={busy} onClick={() => transfer(sheet.wish, sheet.mode, t)}>
                    <span className={`access-cover t${cover(t.cover).t}`} aria-hidden="true">{cover(t.cover).e}</span>
                    <span style={{ flex: 1 }}>{t.title}</span><IconChevron />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "contributeFor"} onClose={close} label="Beitrag eintragen">
        {sheet?.kind === "contributeFor" && (
          <ContributeForForm wish={sheet.wish} open={Math.max(0, giftTarget(sheet.wish) - giftFunded(resOf(sheet.wish)))}
            busy={busy} onSubmit={(n, a) => contributeFor(sheet.wish, n, a)} />
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "reserveFor"} onClose={close} label="Für jemanden reservieren">
        {sheet?.kind === "reserveFor" && (
          <ReserveForForm wish={sheet.wish} free={sheet.wish.quantity - resOf(sheet.wish).reduce((a, r) => a + r.quantity, 0)}
            busy={busy} onSubmit={(n, q, pb) => reserveFor(sheet.wish, n, q, pb)} />
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "archive"} onClose={close} label="Liste abschließen">
        <h2>„{list.title}“ abschließen?</h2>
        <p>Die Liste bleibt mit allen Wünschen und Reservierungen erhalten und wandert ins Archiv. Gäste können sie nicht mehr öffnen. Du kannst sie jederzeit wieder öffnen.</p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <button className="btn" disabled={busy} onClick={() => setArchived(true)}>Abschließen</button>
          <button className="btn soft" onClick={close}>Abbrechen</button>
        </div>
      </Sheet>

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

function ReuseForm({ list, showRes, onSubmit }: {
  list: WishList;
  showRes: boolean;
  onSubmit: (v: { title: string; date: string; onlyFree: boolean; archiveOld: boolean }) => void;
}) {
  const nextYear = (d: string | null) => {
    if (!d) return "";
    const x = new Date(d + "T12:00:00");
    x.setFullYear(x.getFullYear() + 1);
    return x.toISOString().slice(0, 10);
  };
  const [title, setTitle] = useState(list.title.replace(/\b(\d{1,2})\.(?= Geburtstag)/, (_, n) => `${Number(n) + 1}.`));
  const [date, setDate] = useState(nextYear(list.event_date));
  const [onlyFree, setOnlyFree] = useState(true);
  const [archiveOld, setArchiveOld] = useState(!list.archived_at);
  return (
    <form id="reuse-list" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), date, onlyFree, archiveOld }); }}>
      <p className="hint" style={{ marginBottom: 16 }}>Legt eine neue Liste mit denselben Angaben an und übernimmt die Wünsche, ohne Reservierungen.</p>
      <label className="field"><span>Name der neuen Liste</span><input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>Datum (optional)</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="switch" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
        <span><b>Nur Wünsche übernehmen, die noch frei sind</b><br /><span className="hint">{showRes ? "Was schon verschenkt wurde, bleibt weg." : "Da du Reservierungen ausgeblendet hast, werden alle Wünsche übernommen."}</span></span>
      </label>
      {!list.archived_at && (
        <label className="switch">
          <input type="checkbox" checked={archiveOld} onChange={(e) => setArchiveOld(e.target.checked)} />
          <span><b>Alte Liste abschließen</b><br /><span className="hint">Sie wandert ins Archiv, der alte Gast-Link wird pausiert.</span></span>
        </label>
      )}
    </form>
  );
}

/** Eltern tragen eine Reservierung für jemanden ein, z. B. nach einem Anruf von Oma. */
function ReserveForForm({ wish, free, busy, onSubmit }: {
  wish: Wish; free: number; busy: boolean; onSubmit: (name: string, qty: number, parentsBuy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [parentsBuy, setParentsBuy] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim(), qty, parentsBuy); }}>
      <h2>Für jemanden reservieren</h2>
      <p className="hint" style={{ marginBottom: 14 }}>„{wish.title}“ wird für diese Person reserviert, zum Beispiel wenn sie angerufen hat. Alle anderen sehen dann: vergeben.</p>
      <label className="field">
        <span>Für wen?</span>
        <input required autoFocus maxLength={60} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setName(e.target.value)} />
      </label>
      {free > 1 && (
        <div className="qty-row">
          <span className="qty-label">Wie viele? <span className="optional">(noch {free} frei)</span></span>
          <div className="stepper" role="group" aria-label="Menge">
            <button type="button" aria-label="Weniger" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <output>{qty}</output>
            <button type="button" aria-label="Mehr" disabled={qty >= free} onClick={() => setQty(qty + 1)}>+</button>
          </div>
        </div>
      )}
      <label className="switch" style={{ margin: "6px 0 18px" }}>
        <input type="checkbox" checked={parentsBuy} onChange={(e) => setParentsBuy(e.target.checked)} />
        <span><b>Wir besorgen das Geschenk</b><br /><span className="hint">Die Person gibt euch das Geld, ihr kauft es.</span></span>
      </label>
      <button type="submit" className="btn block big" disabled={busy}>{busy ? "Wird reserviert …" : "Reservieren"}</button>
    </form>
  );
}

const firstNameOf = (n: string) => {
  const f = n.trim().split(/[\s._+-]+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
};

/** Eltern tragen einen Beitrag für jemanden ein (z. B. „Oma gibt 50 € dazu“). */
function ContributeForForm({ wish, open, busy, onSubmit }: { wish: Wish; open: number; busy: boolean; onSubmit: (name: string, amount: number) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const cents = parsePrice(amount);
  const ok = !!name.trim() && cents != null && cents >= Math.min(500, open) && cents <= open;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(name.trim(), cents!); }}>
      <h2>Beitrag eintragen</h2>
      <p className="hint" style={{ marginBottom: 14 }}>Für „{wish.title}“ fehlen noch {euroShort(open)}.</p>
      <label className="field">
        <span>Von wem?</span>
        <input required autoFocus maxLength={60} value={name} placeholder="z. B. Oma Gisela" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Betrag</span>
        <input required inputMode="decimal" value={amount} placeholder="z. B. 50" onChange={(e) => setAmount(e.target.value)} />
        {cents != null && cents > open && <small className="field-error">Höchstens {euroShort(open)}.</small>}
      </label>
      <button type="submit" className="btn block big" disabled={busy || !ok}>{busy ? "Wird eingetragen …" : cents ? `${euroShort(cents)} eintragen` : "Eintragen"}</button>
    </form>
  );
}
