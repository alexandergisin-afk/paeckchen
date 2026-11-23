import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SkeletonListPage } from "../components/Skeleton";
import { usePullToRefresh, useRefreshOnReturn } from "../lib/useRefresh";
import { PullIndicator } from "../components/PullIndicator";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { cover, type Reservation, type Wish, type WishList } from "../lib/types";
import { countdownLabel, dateLabel, daysUntil, friendlyError, toast, toastAction, firstNameOf } from "../lib/format";
import { deferred } from "../lib/undo";
import { celebrate } from "../lib/celebrate";
import { removeImage } from "../lib/wishes";
import { copyWishes, moveWish } from "../lib/listOps";
import { cachedListPage, loadListPage, type ListPageData } from "../lib/listData";
import { euroShort, giftFunded, giftTarget, isGroupGift, takenQuantity } from "../lib/gift";
import { IconEyeOff, IconHistory, IconArchive, IconBack, IconChevron, IconCopy, IconGift, IconEdit, IconEye, IconGrid, IconMove, IconPlus, IconRepeat, IconRows, IconShare, IconTrash, IconUndo, IconUsers } from "../components/Icons";
import { Sheet } from "../components/Sheet";
import { FormSheet } from "../components/FormSheet";
import { ListForm, toRow, type ListInput } from "../components/ListForm";
import { WishForm } from "../components/WishForm";
import { AddWishFlow } from "../components/AddWishFlow";
import { WishCard, WishRow } from "../components/WishRow";
import { ShareContent } from "../components/ShareSheet";
import { getItem, KEYS, setItem } from "../lib/storage";
import { ReuseForm } from "../components/list/ReuseForm";
import { ReserveForForm, ContributeForForm } from "../components/list/ForSomeoneForms";
import { ContributionsPanel } from "../components/list/ContributionsPanel";
import { LastChange } from "../components/list/LastChange";
import { useAllReservedCelebration } from "../lib/useAllReservedCelebration";

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
    return getItem(KEYS.wishView) === "grid" ? "grid" : "rows";
  });
  const chooseView = (v: "rows" | "grid") => {
    setView(v);
    setItem(KEYS.wishView, v);
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

  // Ausgeblendet, solange „Rückgängig“ noch möglich ist (auch beim Neuladen)
  const hidden = useRef({ wishes: new Set<string>(), res: new Set<string>() });

  const apply = useCallback((d: ListPageData | null | undefined) => {
    if (d === undefined) return;
    if (d === null) return setState("missing");
    setList(d.list);
    setWishes(d.wishes.filter((w) => !hidden.current.wishes.has(w.id)));
    setReservations(d.reservations.filter((r) => !hidden.current.res.has(r.id)));
    setState("ok");
  }, []);

  // Bereits geladene Liste sofort zeigen, dann im Hintergrund frisch laden
  const load = useCallback(async () => {
    try {
      apply(await loadListPage(id!));
    } catch {
      if (!cachedListPage(id!)) setState("error");
    }
  }, [id, apply]);

  useLayoutEffect(() => { apply(cachedListPage(id!)); }, [id, apply]);
  const ptr = usePullToRefresh(() => load());


  useAllReservedCelebration(state === "ok" ? list : null, session?.user.id, wishes, reservations);
  useRefreshOnReturn(() => load());

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <SkeletonListPage />;
  if (state !== "ok" || !list)
    return (
      <div className="wrap narrow">
        <h1>{state === "missing" ? "Diese Liste gibt es nicht oder du hast keinen Zugriff." : "Die Liste konnte nicht geladen werden."}</h1>
        <p className="mt-16"><Link className="btn soft" to="/">Zu meinen Listen</Link></p>
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

  /** Mit Rückfrage nur, wenn eine fremde Reservierung betroffen sein kann. */
  const askDeleteWish = (w: Wish) => {
    if (!showRes || resOf(w).length > 0) return setSheet({ kind: "deleteWish", wish: w });
    deleteWish(w);
  };

  const deleteWish = (w: Wish) => {
    close();
    hidden.current.wishes.add(w.id);
    setWishes((ws) => ws.filter((x) => x.id !== w.id));
    const job = deferred(async () => {
      const { error } = await db().from("wishes").delete().eq("id", w.id);
      if (error) toast(friendlyError(error));
      else await removeImage(w.image_path);
      hidden.current.wishes.delete(w.id);
      load();
    });
    toastAction(`„${w.title}“ gelöscht.`, "Rückgängig", () => {
      job.cancel();
      hidden.current.wishes.delete(w.id);
      load();
    });
  };

  const release = (r: Reservation) => {
    close();
    hidden.current.res.add(r.id);
    setReservations((rs) => rs.filter((x) => x.id !== r.id));
    const job = deferred(async () => {
      const { error } = await db().from("reservations").delete().eq("id", r.id);
      if (error) toast(friendlyError(error));
      hidden.current.res.delete(r.id);
      load();
    });
    toastAction(`Reservierung von ${r.guest_name} freigegeben.`, "Rückgängig", () => {
      job.cancel();
      hidden.current.res.delete(r.id);
      load();
    });
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
        p_event_date: form.date || null, p_cover: list.cover, p_description: list.description, p_allow_parents_buy: !!list.allow_parents_buy,
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
    if ((r.open_cents ?? 1) === 0) { celebrate("big"); toast(`${euroShort(amount)} von ${name} eingetragen. Das Geschenk ist komplett!`); }
    else toast(`${euroShort(amount)} von ${name} eingetragen.`);
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
      <PullIndicator {...ptr} />
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

        {wishes.length > 0 && <nav className="action-grid" aria-label="Aktionen für diese Liste">
          <button className="action-tile" onClick={() => setSheet({ kind: "share" })}><IconShare /> Teilen</button>
          <Link className="action-tile" to={`/w/${list.guest_token}`}><IconEye /> Gästeansicht</Link>
          <Link className="action-tile" to={`/liste/${list.id}/mitglieder`}><IconUsers /> Mitglieder</Link>
        </nav>}

        {wishes.length > 0 && (
          <section className={`status-line-bar ${showRes ? "" : "is-hidden"}`} aria-label="Stand der Reservierungen">
            {showRes ? (
              <>
                <span className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                <Link className="status-text status-link" to={`/statistik?liste=${list.id}`} title="Statistik zu dieser Liste">
                  <b>{takenQty} von {totalQty}</b> vergeben <IconChevron />
                </Link>
              </>
            ) : (
              <span className="status-text" title="Gilt nur für dich. Praktisch, wenn die Liste für dich selbst ist.">
                <IconEyeOff /> Reservierungen ausgeblendet
              </span>
            )}
            <button type="button" className="btn quiet small status-toggle" aria-pressed={!showRes} onClick={() => toggleShow(!showRes)}
              aria-label={showRes ? "Reservierungen für mich ausblenden" : "Reservierungen wieder anzeigen"}>
              {showRes ? <><IconEyeOff /> Ausblenden</> : <><IconEye /> Anzeigen</>}
            </button>
          </section>
        )}

        {wishes.length > 0 && <LastChange listId={list.id} watch={[list, wishes, reservations]} />}

        {wishes.length > 0 && <div className="wl-bar">
          <h2 className="section-title">Wünsche</h2>
          {wishes.length > 0 && (
            <div className="view-toggle" role="group" aria-label="Ansicht der Wünsche">
              <button type="button" aria-pressed={view === "rows"} onClick={() => chooseView("rows")}><IconRows /> Liste</button>
              <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}><IconGrid /> Kacheln</button>
            </div>
          )}
        </div>}
        {wishes.length === 0 ? (
          <section className="start-card">
            <span className="start-icon" aria-hidden="true">🎁</span>
            <h2>Was wünscht sich {list.recipient_name?.trim() || "das Kind"}?</h2>
            <p>Trag zuerst ein paar Wünsche ein. Danach kannst du die Liste mit der Familie teilen.</p>
            <button className="btn big block" onClick={() => setSheet({ kind: "addWish" })}><IconPlus /> Ersten Wunsch hinzufügen</button>
            <Link className="start-secondary" to={`/liste/${list.id}/mitglieder`}><IconUsers /> Mitbearbeiter einladen</Link>
          </section>
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
              <Link to={`/liste/${list.id}/verlauf`} onClick={close}><IconHistory /> Verlauf ansehen</Link>
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
            {showRes && isGroupGift(sheet.wish) && (
              <ContributionsPanel wish={sheet.wish} contributions={resOf(sheet.wish)} busy={busy}
                onRelease={release}
                onAdd={() => setSheet({ kind: "contributeFor", wish: sheet.wish })}
                onTakeRest={(open) => contributeFor(sheet.wish, firstNameOf(displayName) || "Wir", open)} />
            )}
            <div className="menu form-extra">
              <button type="button" onClick={() => openTransfer(sheet.wish, "move")}><IconMove /> In andere Liste verschieben</button>
              <button type="button" onClick={() => openTransfer(sheet.wish, "copy")}><IconCopy /> In andere Liste kopieren</button>
              {showRes && !isGroupGift(sheet.wish) && sheet.wish.quantity - takenQuantity(sheet.wish, resOf(sheet.wish)) > 0 && (
                <button type="button" onClick={() => setSheet({ kind: "reserveFor", wish: sheet.wish })}><IconGift /> Für jemanden reservieren</button>
              )}
              {showRes && !isGroupGift(sheet.wish) && resOf(sheet.wish).map((r) => (
                <button type="button" key={r.id} onClick={() => release(r)}>
                  <IconUndo /> {r.amount_cents != null ? `Beitrag von ${r.guest_name} (${euroShort(r.amount_cents)}) freigeben` : `Reservierung von ${r.guest_name} freigeben`}
                </button>
              ))}
              <button type="button" className="danger" onClick={() => askDeleteWish(sheet.wish)}><IconTrash /> Wunsch löschen</button>
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
            {!sheet.targets ? <p className="loading minh-80">Listen werden geladen …</p> : sheet.targets.length === 0 ? (
              <p className="mt-12">Du hast keine andere aktive Liste.</p>
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
        <div className="toolbar mt-18">
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
        <div className="toolbar mt-18">
          <button className="btn danger" onClick={deleteList} disabled={busy}>Endgültig löschen</button>
          <button className="btn soft" onClick={close}>Abbrechen</button>
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "deleteWish"} onClose={close} label="Wunsch löschen">
        {sheet?.kind === "deleteWish" && (
          <>
            <h2>„{sheet.wish.title}“ löschen?</h2>
            <p>{resOf(sheet.wish).length > 0
              ? `${resOf(sheet.wish).map((r) => r.guest_name).join(", ")} ${resOf(sheet.wish).length === 1 ? "hat" : "haben"} diesen Wunsch schon reserviert und ${resOf(sheet.wish).length === 1 ? "verliert die Reservierung" : "verlieren ihre Reservierungen"}. Sprich dich am besten vorher ab.`
              : "Deine Reservierungen sind ausgeblendet. Falls schon jemand diesen Wunsch reserviert hat, verliert die Person ihre Reservierung."}</p>
            <div className="toolbar mt-18">
              <button className="btn danger" onClick={() => deleteWish(sheet.wish)} disabled={busy}>Löschen</button>
              <button className="btn soft" onClick={close}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>

    </>
  );
}
